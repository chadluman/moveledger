const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");

const ENV_FILE = path.join(__dirname, ".env");
if (fs.existsSync(ENV_FILE) && typeof process.loadEnvFile === "function") process.loadEnvFile(ENV_FILE);

const PORT = process.env.PORT || 5510;
const SRC_DIR = path.join(__dirname, "src");
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || "moveledger";
const SESSION_COOKIE = "moveledger_session";
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
let mongoClient;
let database;

const MIME_TYPES = {
  ".html": "text/html; charset=UTF-8",
  ".js": "text/javascript; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function collection(name) {
  return database.collection(name);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedValue) {
  const [salt, storedHash] = String(storedValue).split(":");
  if (!salt || !storedHash) return false;
  const suppliedHash = crypto.scryptSync(password, salt, 64);
  const expectedHash = Buffer.from(storedHash, "hex");
  return suppliedHash.length === expectedHash.length && crypto.timingSafeEqual(suppliedHash, expectedHash);
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  );
}

async function getSessionUser(request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const session = await collection("sessions").findOne({ token, expiresAt: { $gt: new Date() } });
  if (!session) return null;
  return collection("users").findOne({ id: session.userId });
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=UTF-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) request.destroy(new Error("Request is too large."));
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

async function customerData(userId) {
  const projection = { projection: { _id: 0 } };
  const [user, moves, containers, items, photos] = await Promise.all([
    collection("users").findOne({ id: userId }),
    collection("moves").find({ userId }, projection).sort({ createdAt: -1 }).toArray(),
    collection("containers").find({ userId }, projection).sort({ createdAt: -1 }).toArray(),
    collection("items").find({ userId }, projection).sort({ createdAt: -1 }).toArray(),
    collection("photos").find({ userId }, projection).sort({ createdAt: -1 }).toArray(),
  ]);
  return {
    users: user ? [publicUser(user)] : [],
    moves,
    containers,
    items,
    photos,
    settings: { openAiApiKey: "" },
  };
}

function validateCustomerData(payload, userId) {
  for (const name of ["moves", "containers", "items", "photos"]) {
    if (!Array.isArray(payload[name])) throw new Error(`Invalid ${name} collection.`);
  }

  const moves = payload.moves.filter((record) => record && record.id).map((record) => ({ ...record, userId }));
  const moveIds = new Set(moves.map((record) => record.id));
  const containers = payload.containers
    .filter((record) => record && record.id && moveIds.has(record.moveId))
    .map((record) => ({ ...record, userId }));
  const containerIds = new Set(containers.map((record) => record.id));
  const validChild = (record) => record && record.id && moveIds.has(record.moveId) && containerIds.has(record.containerId);

  return {
    moves,
    containers,
    items: payload.items.filter(validChild).map((record) => ({ ...record, userId })),
    photos: payload.photos.filter(validChild).map((record) => ({ ...record, userId })),
  };
}

async function syncCollection(name, userId, records) {
  const ids = records.map((record) => record.id);
  const deleteFilter = ids.length ? { userId, id: { $nin: ids } } : { userId };
  await collection(name).deleteMany(deleteFilter);
  if (!records.length) return;
  await collection(name).bulkWrite(
    records.map((record) => ({
      replaceOne: { filter: { id: record.id, userId }, replacement: record, upsert: true },
    })),
    { ordered: false },
  );
}

async function replaceCustomerData(userId, payload) {
  const records = validateCustomerData(payload, userId);
  for (const name of ["moves", "containers", "items", "photos"]) {
    await syncCollection(name, userId, records[name]);
  }
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await collection("sessions").insertOne({
    token,
    userId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
  });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`;
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/health" && request.method === "GET") {
    await database.command({ ping: 1 });
    return sendJson(response, 200, { ok: true, database: "mongodb" });
  }

  if (pathname === "/api/auth/register" && request.method === "POST") {
    const body = await readJson(request);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!name || !email || password.length < 8) {
      return sendJson(response, 400, { error: "Name, email, and a password of at least 8 characters are required." });
    }
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    try {
      await collection("users").insertOne(user);
    } catch (error) {
      if (error.code === 11000) return sendJson(response, 409, { error: "An account already exists for that email." });
      throw error;
    }
    return sendJson(response, 201, { user: publicUser(user), data: await customerData(user.id) }, {
      "Set-Cookie": await createSession(user.id),
    });
  }

  if (pathname === "/api/auth/login" && request.method === "POST") {
    const body = await readJson(request);
    const email = String(body.email || "").trim().toLowerCase();
    const user = await collection("users").findOne({ email });
    if (!user || !verifyPassword(String(body.password || ""), user.passwordHash)) {
      return sendJson(response, 401, { error: "Email or password is incorrect." });
    }
    return sendJson(response, 200, { user: publicUser(user), data: await customerData(user.id) }, {
      "Set-Cookie": await createSession(user.id),
    });
  }

  if (pathname === "/api/auth/logout" && request.method === "POST") {
    const token = parseCookies(request)[SESSION_COOKIE];
    if (token) await collection("sessions").deleteOne({ token });
    return sendJson(response, 200, { ok: true }, {
      "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    });
  }

  const user = await getSessionUser(request);
  if (pathname === "/api/session" && request.method === "GET") {
    return sendJson(response, 200, user ? { user: publicUser(user), data: await customerData(user.id) } : { user: null });
  }
  if (!user) return sendJson(response, 401, { error: "Authentication required." });

  if (pathname === "/api/data" && request.method === "PUT") {
    await replaceCustomerData(user.id, await readJson(request));
    return sendJson(response, 200, { ok: true });
  }

  return sendJson(response, 404, { error: "API route not found." });
}

async function serveStatic(request, response, pathname) {
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const relativePath = path.normalize(requestPath).replace(/^([/\\]*\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  const filePath = path.join(SRC_DIR, relativePath);
  if (!filePath.startsWith(`${SRC_DIR}${path.sep}`)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=UTF-8" });
    return response.end("Forbidden");
  }
  try {
    const content = await fsp.readFile(filePath);
    response.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=UTF-8" });
    response.end("Not found");
  }
}

async function ensureIndexes() {
  await Promise.all([
    collection("users").createIndex({ email: 1 }, { unique: true }),
    collection("users").createIndex({ id: 1 }, { unique: true }),
    collection("moves").createIndex({ id: 1 }, { unique: true }),
    collection("moves").createIndex({ userId: 1, createdAt: -1 }),
    collection("containers").createIndex({ id: 1 }, { unique: true }),
    collection("containers").createIndex({ userId: 1, moveId: 1 }),
    collection("items").createIndex({ id: 1 }, { unique: true }),
    collection("items").createIndex({ userId: 1, moveId: 1, containerId: 1 }),
    collection("photos").createIndex({ id: 1 }, { unique: true }),
    collection("photos").createIndex({ userId: 1, moveId: 1, containerId: 1 }),
    collection("sessions").createIndex({ token: 1 }, { unique: true }),
    collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

async function ensureDemoAccount() {
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const result = await collection("users").updateOne(
    { email: "demo@moveledger.app" },
    {
      $setOnInsert: {
        id: userId,
        name: "Demo Customer",
        email: "demo@moveledger.app",
        passwordHash: hashPassword("demo1234"),
        createdAt: now,
      },
    },
    { upsert: true },
  );
  if (!result.upsertedCount) return;

  const moveId = crypto.randomUUID();
  const containerId = crypto.randomUUID();
  await Promise.all([
    collection("moves").insertOne({ id: moveId, userId, name: "Sample Military Move", origin: "Fort Carson, CO", destination: "Norfolk, VA", moveDate: now.slice(0, 10), status: "Packing", createdAt: now }),
    collection("containers").insertOne({ id: containerId, moveId, userId, name: "Kitchen Bin 01", location: "Garage staging wall", type: "Plastic tote", notes: "Fragile dishware and coffee setup", qrValue: `moveledger://${moveId}/${containerId}`, createdAt: now }),
    collection("items").insertOne({ id: crypto.randomUUID(), containerId, moveId, userId, name: "Pour-over coffee kit", quantity: 1, room: "Kitchen", notes: "Glass dripper wrapped in towels", source: "Manual", status: "Packed", createdAt: now }),
  ]);
}

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host || "localhost"}`).pathname;
  try {
    if (pathname.startsWith("/api/")) await handleApi(request, response, pathname);
    else await serveStatic(request, response, pathname);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { error: "Unexpected server error." });
    else response.end();
  }
});

async function start() {
  if (!MONGODB_URI) throw new Error("MONGODB_URI is required. Copy .env.example to .env and add your connection string.");
  mongoClient = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoClient.connect();
  database = mongoClient.db(MONGODB_DATABASE);
  await database.command({ ping: 1 });
  await ensureIndexes();
  await ensureDemoAccount();
  server.listen(PORT, () => console.log(`MoveLedger running at http://localhost:${PORT} with MongoDB database ${MONGODB_DATABASE}`));
}

async function shutdown() {
  server.close();
  if (mongoClient) await mongoClient.close();
}

process.on("SIGINT", () => shutdown().finally(() => process.exit(0)));
process.on("SIGTERM", () => shutdown().finally(() => process.exit(0)));

start().catch((error) => {
  console.error("MoveLedger failed to initialize:", error.message);
  process.exitCode = 1;
});
