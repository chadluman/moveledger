const STORAGE_KEY = "move-ledger-demo-v1";

const state = {
  authMode: "login",
  currentUserId: null,
  data: loadData(),
};

const elements = {
  authTitle: document.querySelector("#authTitle"),
  toggleAuthMode: document.querySelector("#toggleAuthMode"),
  authSubmit: document.querySelector("#authSubmit"),
  authForm: document.querySelector("#authForm"),
  authName: document.querySelector("#authName"),
  authEmail: document.querySelector("#authEmail"),
  authPassword: document.querySelector("#authPassword"),
  nameField: document.querySelector("#nameField"),
  appContent: document.querySelector("#appContent"),
  workspaceTemplate: document.querySelector("#workspaceTemplate"),
  welcomeMessage: document.querySelector("#welcomeMessage"),
  workspaceTitle: document.querySelector("#workspaceTitle"),
  logoutButton: document.querySelector("#logoutButton"),
  heroMovesCount: document.querySelector("#heroMovesCount"),
  heroContainersCount: document.querySelector("#heroContainersCount"),
  heroItemsCount: document.querySelector("#heroItemsCount"),
};

initialize();

function initialize() {
  state.currentUserId = state.data.sessionUserId || null;

  elements.toggleAuthMode.addEventListener("click", toggleAuthMode);
  elements.authForm.addEventListener("submit", handleAuthSubmit);
  elements.logoutButton.addEventListener("click", handleLogout);

  seedDemoUser();
  render();
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      users: [],
      moves: [],
      containers: [],
      items: [],
      photos: [],
      sessionUserId: null,
      settings: {
        openAiApiKey: "",
      },
    };
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Failed to parse existing data, resetting.", error);
    localStorage.removeItem(STORAGE_KEY);
    return loadData();
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function seedDemoUser() {
  if (state.data.users.length > 0) return;

  const userId = crypto.randomUUID();
  const moveId = crypto.randomUUID();
  const containerId = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  const photoId = crypto.randomUUID();

  state.data.users.push({
    id: userId,
    name: "Demo Customer",
    email: "demo@moveledger.app",
    password: "demo1234",
    createdAt: new Date().toISOString(),
  });

  state.data.moves.push({
    id: moveId,
    userId,
    name: "Sample Military Move",
    origin: "Fort Carson, CO",
    destination: "Norfolk, VA",
    moveDate: new Date().toISOString().slice(0, 10),
    status: "Packing",
    createdAt: new Date().toISOString(),
  });

  state.data.containers.push({
    id: containerId,
    moveId,
    userId,
    name: "Kitchen Bin 01",
    location: "Garage staging wall",
    type: "Plastic tote",
    notes: "Fragile dishware and coffee setup",
    qrValue: `moveledger://${moveId}/${containerId}`,
    createdAt: new Date().toISOString(),
  });

  state.data.items.push({
    id: itemId,
    containerId,
    moveId,
    userId,
    name: "Pour-over coffee kit",
    quantity: 1,
    room: "Kitchen",
    notes: "Glass dripper wrapped in towels",
    source: "Manual",
    status: "Packed",
    createdAt: new Date().toISOString(),
  });

  state.data.photos.push({
    id: photoId,
    containerId,
    moveId,
    userId,
    caption: "Demo inventory photo",
    dataUrl:
      "data:image/svg+xml;base64," +
      btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
        <rect width="100%" height="100%" fill="#efe5d8"/>
        <rect x="80" y="90" width="480" height="300" rx="24" fill="#fffdfa" stroke="#c6b39b"/>
        <rect x="126" y="146" width="150" height="130" rx="16" fill="#d9b48f"/>
        <rect x="310" y="126" width="180" height="180" rx="20" fill="#8db6a0"/>
        <text x="320" y="355" font-family="Arial" font-size="28" fill="#5c4e42">Sample photo record</text>
      </svg>`),
    aiSummary: "Suggested inventory: coffee kit, mugs, small kitchen tools.",
    createdAt: new Date().toISOString(),
  });

  saveData();
}

function toggleAuthMode() {
  state.authMode = state.authMode === "login" ? "register" : "login";
  renderAuth();
}

function handleAuthSubmit(event) {
  event.preventDefault();
  const email = elements.authEmail.value.trim().toLowerCase();
  const password = elements.authPassword.value.trim();
  const name = elements.authName.value.trim();

  if (state.authMode === "register") {
    if (!name) {
      window.alert("Please enter a full name.");
      return;
    }
    if (state.data.users.some((user) => user.email === email)) {
      window.alert("An account already exists for that email.");
      return;
    }

    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      password,
      createdAt: new Date().toISOString(),
    };

    state.data.users.push(user);
    setSession(user.id);
  } else {
    const user = state.data.users.find(
      (candidate) => candidate.email === email && candidate.password === password,
    );

    if (!user) {
      window.alert("Invalid login. Try demo@moveledger.app / demo1234 to explore.");
      return;
    }

    setSession(user.id);
  }

  elements.authForm.reset();
  render();
}

function setSession(userId) {
  state.currentUserId = userId;
  state.data.sessionUserId = userId;
  saveData();
}

function handleLogout() {
  state.currentUserId = null;
  state.data.sessionUserId = null;
  saveData();
  render();
}

function render() {
  renderAuth();
  renderWorkspace();
  renderHeroStats();
}

function renderAuth() {
  const isRegister = state.authMode === "register";
  elements.authTitle.textContent = isRegister ? "Create Account" : "Log In";
  elements.toggleAuthMode.textContent = isRegister
    ? "Already have an account?"
    : "Need an account?";
  elements.authSubmit.textContent = isRegister ? "Create Account" : "Log In";
  elements.nameField.classList.toggle("field--hidden", !isRegister);
}

function renderHeroStats() {
  const moves = visibleMoves();
  const containers = visibleContainers();
  const items = visibleItems();

  elements.heroMovesCount.textContent = String(moves.length);
  elements.heroContainersCount.textContent = String(containers.length);
  elements.heroItemsCount.textContent = String(items.length);
}

function renderWorkspace() {
  const currentUser = getCurrentUser();
  elements.appContent.innerHTML = "";

  if (!currentUser) {
    elements.workspaceTitle.textContent = "Create and manage moving inventories";
    elements.welcomeMessage.textContent = "Not signed in";
    elements.appContent.innerHTML = `
      <div class="empty-state">
        <h3>Sign in to start a move record</h3>
        <p>
          Use the demo account or create your own. This MVP stores data in the browser,
          so it’s a safe place to shape the workflow before adding a secure backend.
        </p>
      </div>
    `;
    return;
  }

  elements.workspaceTitle.textContent = "Move operations center";
  elements.welcomeMessage.textContent = `Signed in as ${currentUser.name}`;

  elements.appContent.append(elements.workspaceTemplate.content.cloneNode(true));

  wireWorkspaceEvents();
  renderMovesList();
  renderSearchResults("");
}

function wireWorkspaceEvents() {
  document.querySelector("#moveForm").addEventListener("submit", handleCreateMove);
  document.querySelector("#globalSearch").addEventListener("input", (event) => {
    renderSearchResults(event.target.value);
  });
  document.querySelector("#aiSettingsForm").addEventListener("submit", handleAiSettingsSave);
  document.querySelector("#openAiKey").value =
    state.data.settings?.openAiApiKey || window.localStorage.getItem("move-ledger-openai-key") || "";
}

function handleCreateMove(event) {
  event.preventDefault();
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  const form = event.currentTarget;
  const move = {
    id: crypto.randomUUID(),
    userId: currentUser.id,
    name: form.querySelector("#moveName").value.trim(),
    origin: form.querySelector("#moveOrigin").value.trim(),
    destination: form.querySelector("#moveDestination").value.trim(),
    moveDate: form.querySelector("#moveDate").value,
    status: "Planning",
    createdAt: new Date().toISOString(),
  };

  state.data.moves.unshift(move);
  saveData();
  form.reset();
  render();
}

function handleAiSettingsSave(event) {
  event.preventDefault();
  const key = document.querySelector("#openAiKey").value.trim();
  state.data.settings.openAiApiKey = key;
  window.localStorage.setItem("move-ledger-openai-key", key);
  saveData();
  window.alert(key ? "AI key saved in this browser." : "Stored AI key cleared.");
}

function renderMovesList() {
  const container = document.querySelector("#movesList");
  const moves = visibleMoves();

  if (moves.length === 0) {
    container.className = "moves-list empty-hint";
    container.textContent = "No moves yet. Create the first move above.";
    return;
  }

  container.className = "moves-list";
  container.innerHTML = moves
    .map((move) => {
      const containers = state.data.containers.filter((containerRecord) => containerRecord.moveId === move.id);
      const items = state.data.items.filter((item) => item.moveId === move.id);
      const labels = containers.length === 1 ? "container" : "containers";
      const itemLabel = items.length === 1 ? "item" : "items";

      return `
        <article class="move-card">
          <div class="move-card__header">
            <div>
              <p class="tag">${escapeHtml(move.status)}</p>
              <h4 class="move-card__title">${escapeHtml(move.name)}</h4>
            </div>
            <button class="secondary-button" type="button" data-action="toggle-move" data-move-id="${move.id}">
              Open Move
            </button>
          </div>
          <div class="move-card__meta">
            <span>${escapeHtml(move.origin)} to ${escapeHtml(move.destination)}</span>
            <span>Move date: ${formatDate(move.moveDate)}</span>
            <span>${containers.length} ${labels}, ${items.length} ${itemLabel}</span>
          </div>
          <div id="move-details-${move.id}" class="move-details" hidden></div>
        </article>
      `;
    })
    .join("");

  container.querySelectorAll('[data-action="toggle-move"]').forEach((button) => {
    button.addEventListener("click", () => toggleMoveDetails(button.dataset.moveId));
  });
}

function toggleMoveDetails(moveId) {
  const target = document.querySelector(`#move-details-${CSS.escape(moveId)}`);
  const button = document.querySelector(`[data-action="toggle-move"][data-move-id="${moveId}"]`);
  const isHidden = target.hasAttribute("hidden");

  document.querySelectorAll(".move-details").forEach((panel) => panel.setAttribute("hidden", ""));
  document.querySelectorAll('[data-action="toggle-move"]').forEach((node) => {
    node.textContent = "Open Move";
  });

  if (!isHidden) {
    return;
  }

  target.removeAttribute("hidden");
  button.textContent = "Hide Move";
  target.innerHTML = buildMoveDetails(moveId);
  wireMoveDetailEvents(moveId);
  hydrateMoveDetailQr(moveId);
}

function buildMoveDetails(moveId) {
  const move = state.data.moves.find((record) => record.id === moveId);
  const containers = state.data.containers.filter((record) => record.moveId === moveId);
  const items = state.data.items.filter((record) => record.moveId === moveId);
  const photos = state.data.photos.filter((record) => record.moveId === moveId);

  return `
    <div class="move-sections">
      <div class="section-grid">
        <section class="card">
          <div class="card__header">
            <div>
              <p class="eyebrow">Add Container</p>
              <h3>Create a labeled bin or box</h3>
            </div>
          </div>
          <form class="stack" data-form="container" data-move-id="${moveId}">
            <label class="field">
              <span>Container name</span>
              <input name="name" type="text" placeholder="Master Closet Box 03" required />
            </label>
            <label class="field">
              <span>Current location</span>
              <input name="location" type="text" placeholder="Primary bedroom" required />
            </label>
            <label class="field">
              <span>Container type</span>
              <input name="type" type="text" placeholder="Wardrobe box, tote, crate..." required />
            </label>
            <label class="field">
              <span>Notes</span>
              <textarea name="notes" placeholder="High value uniforms, fragile decor, donation hold..."></textarea>
            </label>
            <button class="primary-button" type="submit">Create QR Container</button>
          </form>
        </section>

        <section class="card">
          <div class="card__header">
            <div>
              <p class="eyebrow">Move Snapshot</p>
              <h3>${escapeHtml(move.name)}</h3>
            </div>
            <span class="tag">${escapeHtml(move.status)}</span>
          </div>
          <div class="stack">
            <div class="record-row">
              <div>
                <strong>Route</strong>
                <p class="record-row__meta">${escapeHtml(move.origin)} to ${escapeHtml(move.destination)}</p>
              </div>
              <div>
                <strong>Date</strong>
                <p class="record-row__meta">${formatDate(move.moveDate)}</p>
              </div>
            </div>
            <div class="record-row">
              <div>
                <strong>Containers</strong>
                <p class="record-row__meta">${containers.length}</p>
              </div>
              <div>
                <strong>Logged Items</strong>
                <p class="record-row__meta">${items.length}</p>
              </div>
              <div>
                <strong>Photos</strong>
                <p class="record-row__meta">${photos.length}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section class="card">
        <div class="card__header">
          <div>
            <p class="eyebrow">Containers</p>
            <h3>Pack, print, and inventory by QR</h3>
          </div>
        </div>
        <div class="container-list">
          ${
            containers.length === 0
              ? `<div class="empty-hint">No containers yet. Create the first one for this move.</div>`
              : containers.map((container) => buildContainerCard(container)).join("")
          }
        </div>
      </section>
    </div>
  `;
}

function buildContainerCard(container) {
  const items = state.data.items.filter((record) => record.containerId === container.id);
  const photos = state.data.photos.filter((record) => record.containerId === container.id);

  return `
    <article class="container-card">
      <div class="container-card__header">
        <div>
          <h4 class="container-card__title">${escapeHtml(container.name)}</h4>
          <div class="pill-row">
            <span class="badge">${escapeHtml(container.type)}</span>
            <span class="badge">${escapeHtml(container.location)}</span>
          </div>
        </div>
        <div class="qr-frame" id="qr-${container.id}" data-qr-value="${escapeHtml(container.qrValue)}"></div>
      </div>
      <div class="container-card__meta">
        <span>${escapeHtml(container.notes || "No notes added yet.")}</span>
        <span>QR payload: ${escapeHtml(container.qrValue)}</span>
      </div>

      <div class="section-grid">
        <section class="card">
          <div class="card__header">
            <div>
              <p class="eyebrow">Add Items</p>
              <h3>Inventory for ${escapeHtml(container.name)}</h3>
            </div>
          </div>
          <form class="stack" data-form="item" data-container-id="${container.id}">
            <label class="field">
              <span>Item name</span>
              <input name="name" type="text" placeholder="Dress blues, monitor, winter coats..." required />
            </label>
            <div class="workspace-grid">
              <label class="field">
                <span>Quantity</span>
                <input name="quantity" type="number" min="1" value="1" required />
              </label>
              <label class="field">
                <span>Room / category</span>
                <input name="room" type="text" placeholder="Bedroom, office, kitchen..." required />
              </label>
            </div>
            <label class="field">
              <span>Notes</span>
              <textarea name="notes" placeholder="Condition, serial number, who packed it, claim notes..."></textarea>
            </label>
            <button class="primary-button" type="submit">Add Item</button>
          </form>
        </section>

        <section class="card">
          <div class="card__header">
            <div>
              <p class="eyebrow">Photos and AI</p>
              <h3>Capture contents from photos</h3>
            </div>
          </div>
          <form class="stack" data-form="photo" data-container-id="${container.id}">
            <label class="field">
              <span>Photo</span>
              <input name="photo" type="file" accept="image/*" required />
            </label>
            <label class="field">
              <span>Caption</span>
              <input name="caption" type="text" placeholder="Open-top photo before sealing box" />
            </label>
            <label class="field">
              <span>AI notes</span>
              <textarea name="prompt" placeholder="Optional hints: military uniforms, framed photos, coffee gear..."></textarea>
            </label>
            <div class="pill-row">
              <button class="primary-button" type="submit">Save Photo</button>
              <button class="secondary-button" type="button" data-action="run-demo-ai" data-container-id="${container.id}">
                AI Identify Latest Photo
              </button>
            </div>
            <small class="meta">
              Production note: for a live app, AI image analysis should run through a secure backend.
              This MVP includes a browser demo flow and an optional OpenAI direct-call hook.
            </small>
          </form>
        </section>
      </div>

      <div class="section-grid">
        <section class="card">
          <div class="card__header">
            <div>
              <p class="eyebrow">Itemized List</p>
              <h3>Contents logged for accountability</h3>
            </div>
          </div>
          <div class="items-list">
            ${
              items.length === 0
                ? `<div class="empty-hint">No items logged for this container yet.</div>`
                : items.map((item) => buildItemCard(item, container.moveId)).join("")
            }
          </div>
        </section>

        <section class="card">
          <div class="card__header">
            <div>
              <p class="eyebrow">Photo Records</p>
              <h3>Proof and visual references</h3>
            </div>
          </div>
          <div class="photos-grid">
            ${
              photos.length === 0
                ? `<div class="empty-hint">No photos yet. Upload one to preserve a visual record.</div>`
                : photos.map((photo) => buildPhotoCard(photo)).join("")
            }
          </div>
        </section>
      </div>

      <section class="card">
        <div class="card__header">
          <div>
            <p class="eyebrow">Printable Labels</p>
            <h3>QR labels for scanning and paper records</h3>
          </div>
        </div>
        <div class="labels-grid">
          ${buildLabelCard(container)}
        </div>
      </section>
    </article>
  `;
}

function buildItemCard(item, moveId) {
  const moveContainers = state.data.containers.filter((record) => record.moveId === moveId);
  const options = moveContainers
    .map(
      (container) => `
        <option value="${container.id}" ${container.id === item.containerId ? "selected" : ""}>
          ${escapeHtml(container.name)}
        </option>
      `,
    )
    .join("");

  return `
    <article class="inventory-item">
      <div class="inventory-item__header">
        <div>
          <h5>${escapeHtml(item.name)}</h5>
          <p class="inventory-item__meta">
            Qty ${item.quantity} • ${escapeHtml(item.room)} • ${escapeHtml(item.status)}
          </p>
        </div>
        <span class="badge">${escapeHtml(item.source)}</span>
      </div>
      <p class="item-note">${escapeHtml(item.notes || "No extra notes.")}</p>
      <div class="item-actions">
        <label class="field">
          <span>Move to container</span>
          <select data-item-relocate="${item.id}">
            ${options}
          </select>
        </label>
        <button class="secondary-button" type="button" data-action="relocate-item" data-item-id="${item.id}">
          Update Location
        </button>
        <button class="ghost-button ghost-button--danger" type="button" data-action="remove-item" data-item-id="${item.id}">
          Remove Item
        </button>
      </div>
    </article>
  `;
}

function buildPhotoCard(photo) {
  return `
    <article class="photo-card">
      <img src="${photo.dataUrl}" alt="${escapeHtml(photo.caption || "Container photo")}" />
      <h5>${escapeHtml(photo.caption || "Container photo")}</h5>
      <p class="photo-caption">${escapeHtml(photo.aiSummary || "No AI summary yet.")}</p>
    </article>
  `;
}

function buildLabelCard(container) {
  return `
    <article class="label-card" id="label-${container.id}">
      <div class="qr-frame" id="print-qr-${container.id}" data-qr-value="${escapeHtml(container.qrValue)}"></div>
      <div>
        <h5>${escapeHtml(container.name)}</h5>
        <p class="label-card__meta">${escapeHtml(container.type)} • ${escapeHtml(container.location)}</p>
        <p class="label-card__meta">${escapeHtml(container.notes || "No notes")}</p>
        <div class="label-card__actions">
          <button class="primary-button" type="button" data-action="print-label" data-container-id="${container.id}">
            Print Label
          </button>
        </div>
      </div>
    </article>
  `;
}

function wireMoveDetailEvents(moveId) {
  document
    .querySelector(`[data-form="container"][data-move-id="${moveId}"]`)
    .addEventListener("submit", handleCreateContainer);

  document.querySelectorAll(`[data-form="item"]`).forEach((form) => {
    form.addEventListener("submit", handleCreateItem);
  });

  document.querySelectorAll(`[data-form="photo"]`).forEach((form) => {
    form.addEventListener("submit", handleSavePhoto);
  });

  document.querySelectorAll('[data-action="remove-item"]').forEach((button) => {
    button.addEventListener("click", () => removeItem(button.dataset.itemId));
  });

  document.querySelectorAll('[data-action="relocate-item"]').forEach((button) => {
    button.addEventListener("click", () => relocateItem(button.dataset.itemId));
  });

  document.querySelectorAll('[data-action="print-label"]').forEach((button) => {
    button.addEventListener("click", () => printLabel(button.dataset.containerId));
  });

  document.querySelectorAll('[data-action="run-demo-ai"]').forEach((button) => {
    button.addEventListener("click", () => runAiForLatestPhoto(button.dataset.containerId));
  });
}

function hydrateMoveDetailQr(moveId) {
  state.data.containers
    .filter((record) => record.moveId === moveId)
    .forEach((container) => {
      renderQr(`qr-${container.id}`, container.qrValue);
      renderQr(`print-qr-${container.id}`, container.qrValue);
    });
}

function renderQr(targetId, value) {
  const node = document.getElementById(targetId);
  if (!node || node.dataset.rendered === "true") return;

  new QRCode(node, {
    text: value,
    width: 104,
    height: 104,
    colorDark: "#1d1a17",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M,
  });

  node.dataset.rendered = "true";
}

function handleCreateContainer(event) {
  event.preventDefault();
  const currentUser = getCurrentUser();
  const moveId = event.currentTarget.dataset.moveId;
  const form = event.currentTarget;

  const container = {
    id: crypto.randomUUID(),
    moveId,
    userId: currentUser.id,
    name: form.elements.name.value.trim(),
    location: form.elements.location.value.trim(),
    type: form.elements.type.value.trim(),
    notes: form.elements.notes.value.trim(),
    qrValue: `moveledger://${moveId}/${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
  };

  state.data.containers.unshift(container);
  saveData();
  toggleMoveDetails(moveId);
  toggleMoveDetails(moveId);
  renderHeroStats();
}

function handleCreateItem(event) {
  event.preventDefault();
  const currentUser = getCurrentUser();
  const containerId = event.currentTarget.dataset.containerId;
  const container = state.data.containers.find((record) => record.id === containerId);
  const form = event.currentTarget;

  const item = {
    id: crypto.randomUUID(),
    containerId,
    moveId: container.moveId,
    userId: currentUser.id,
    name: form.elements.name.value.trim(),
    quantity: Number(form.elements.quantity.value),
    room: form.elements.room.value.trim(),
    notes: form.elements.notes.value.trim(),
    source: "Manual",
    status: "Packed",
    createdAt: new Date().toISOString(),
  };

  state.data.items.unshift(item);
  saveData();
  form.reset();
  toggleMoveDetails(container.moveId);
  toggleMoveDetails(container.moveId);
  renderSearchResults(document.querySelector("#globalSearch")?.value || "");
  renderHeroStats();
}

async function handleSavePhoto(event) {
  event.preventDefault();
  const currentUser = getCurrentUser();
  const containerId = event.currentTarget.dataset.containerId;
  const container = state.data.containers.find((record) => record.id === containerId);
  const photoFile = event.currentTarget.elements.photo.files[0];

  if (!photoFile) {
    window.alert("Please choose a photo first.");
    return;
  }

  const dataUrl = await fileToDataUrl(photoFile);
  const aiNotes = event.currentTarget.elements.prompt.value.trim();
  const caption = event.currentTarget.elements.caption.value.trim();

  state.data.photos.unshift({
    id: crypto.randomUUID(),
    containerId,
    moveId: container.moveId,
    userId: currentUser.id,
    caption,
    prompt: aiNotes,
    dataUrl,
    aiSummary: "Photo saved. Run AI Identify Latest Photo to suggest item names.",
    createdAt: new Date().toISOString(),
  });

  saveData();
  event.currentTarget.reset();
  toggleMoveDetails(container.moveId);
  toggleMoveDetails(container.moveId);
}

async function runAiForLatestPhoto(containerId) {
  const container = state.data.containers.find((record) => record.id === containerId);
  const photos = state.data.photos.filter((photo) => photo.containerId === containerId);
  const latestPhoto = photos[0];

  if (!latestPhoto) {
    window.alert("Upload a photo before running AI inventory.");
    return;
  }

  let result = null;

  try {
    result = await runOpenAiVision(latestPhoto, container);
  } catch (error) {
    console.warn("OpenAI analysis unavailable, falling back to demo logic.", error);
  }

  if (!result) {
    result = runDemoVision(latestPhoto, container);
  }

  latestPhoto.aiSummary = result.summary;

  result.items.forEach((itemName) => {
    state.data.items.unshift({
      id: crypto.randomUUID(),
      containerId,
      moveId: container.moveId,
      userId: container.userId,
      name: itemName,
      quantity: 1,
      room: guessRoom(container, latestPhoto),
      notes: `AI-suggested from photo ${latestPhoto.caption || ""}`.trim(),
      source: result.source,
      status: "Packed",
      createdAt: new Date().toISOString(),
    });
  });

  saveData();
  toggleMoveDetails(container.moveId);
  toggleMoveDetails(container.moveId);
  renderSearchResults(document.querySelector("#globalSearch")?.value || "");
  renderHeroStats();
}

async function runOpenAiVision(photo, container) {
  const apiKey = state.data.settings?.openAiApiKey || window.localStorage.getItem("move-ledger-openai-key");
  if (!apiKey) return null;

  const prompt = [
    "Analyze this moving-box photo.",
    "Return JSON only with this shape: {\"summary\":\"...\",\"items\":[\"item 1\",\"item 2\"]}.",
    "List up to 8 likely visible household or personal items.",
    `Container: ${container.name}.`,
    photo.prompt ? `Hints: ${photo.prompt}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: photo.dataUrl },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`);
  }

  const payload = await response.json();
  const rawText =
    payload.output_text ||
    payload.output
      ?.flatMap((entry) => entry?.content || [])
      .map((part) => part?.text || "")
      .join(" ")
      .trim();
  if (!rawText) {
    throw new Error("No text returned from OpenAI.");
  }

  const parsed = JSON.parse(extractJson(rawText));
  return {
    summary: parsed.summary,
    items: Array.isArray(parsed.items) ? parsed.items.slice(0, 8) : [],
    source: "OpenAI Vision",
  };
}

function runDemoVision(photo, container) {
  const tokens = `${container.name} ${container.notes || ""} ${photo.caption || ""} ${photo.prompt || ""}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const suggestions = [];
  const keywordMap = [
    { match: ["kitchen", "dish", "coffee", "mug"], items: ["Coffee maker", "Mugs", "Utensils"] },
    { match: ["office", "desk", "monitor", "computer"], items: ["Monitor", "Keyboard", "Desk accessories"] },
    { match: ["uniform", "military", "service"], items: ["Uniform set", "Boots", "Award shadow box"] },
    { match: ["bedroom", "linen", "closet"], items: ["Folded linens", "Hangers", "Shoeboxes"] },
    { match: ["decor", "frame", "fragile"], items: ["Framed photos", "Decor accents", "Wrapped glassware"] },
  ];

  keywordMap.forEach((entry) => {
    if (entry.match.some((token) => tokens.includes(token))) {
      suggestions.push(...entry.items);
    }
  });

  if (suggestions.length === 0) {
    suggestions.push("Assorted household items", "Wrapped personal effects", "Small accessories");
  }

  return {
    summary: `Demo AI suggestion based on container details: ${suggestions.join(", ")}.`,
    items: [...new Set(suggestions)].slice(0, 5),
    source: "Demo AI",
  };
}

function relocateItem(itemId) {
  const item = state.data.items.find((record) => record.id === itemId);
  if (!item) return;

  const select = document.querySelector(`[data-item-relocate="${itemId}"]`);
  const newContainerId = select.value;
  const newContainer = state.data.containers.find((record) => record.id === newContainerId);

  item.containerId = newContainerId;
  item.moveId = newContainer.moveId;
  item.notes = `${item.notes ? `${item.notes} | ` : ""}Moved to ${newContainer.name} on ${new Date().toLocaleDateString()}`;

  saveData();
  render();
}

function removeItem(itemId) {
  state.data.items = state.data.items.filter((record) => record.id !== itemId);
  saveData();
  render();
}

function printLabel(containerId) {
  const container = state.data.containers.find((record) => record.id === containerId);
  const label = document.querySelector(`#label-${CSS.escape(containerId)}`).outerHTML;
  const printWindow = window.open("", "_blank", "width=800,height=600");

  if (!printWindow) {
    window.alert("Please allow pop-ups to print the QR label.");
    return;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(container.name)} QR Label</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 32px; }
          .label-card { display: grid; grid-template-columns: 160px 1fr; gap: 20px; align-items: center; border: 1px solid #ddd; border-radius: 18px; padding: 24px; }
          .qr-frame { width: 124px; height: 124px; }
          .label-card__meta { color: #555; margin: 8px 0; }
        </style>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
      </head>
      <body>${label}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.onload = () => {
    const target = printWindow.document.querySelector(`#print-qr-${containerId}`);
    new printWindow.QRCode(target, {
      text: container.qrValue,
      width: 124,
      height: 124,
      colorDark: "#111111",
      colorLight: "#ffffff",
    });

    printWindow.focus();
    printWindow.print();
  };
}

function renderSearchResults(query) {
  const container = document.querySelector("#searchResults");
  if (!container) return;

  const normalized = query.trim().toLowerCase();
  const hits = visibleItems().filter((item) => {
    const itemContainer = state.data.containers.find((record) => record.id === item.containerId);
    const haystack = [item.name, item.room, item.notes, itemContainer?.name, itemContainer?.location]
      .join(" ")
      .toLowerCase();
    return normalized.length === 0 ? false : haystack.includes(normalized);
  });

  if (!normalized) {
    container.className = "search-results empty-hint";
    container.textContent = "Search results will appear here.";
    return;
  }

  if (hits.length === 0) {
    container.className = "search-results empty-hint";
    container.textContent = "No matching items found in this account.";
    return;
  }

  container.className = "search-results";
  container.innerHTML = hits
    .map((item) => {
      const move = state.data.moves.find((record) => record.id === item.moveId);
      const itemContainer = state.data.containers.find((record) => record.id === item.containerId);
      return `
        <article class="search-hit">
          <strong>${escapeHtml(item.name)}</strong>
          <p class="search-pill">${escapeHtml(move?.name || "Unknown move")}</p>
          <p>${escapeHtml(itemContainer?.name || "Unknown container")} • ${escapeHtml(itemContainer?.location || "No location")}</p>
          <p class="item-note">${escapeHtml(item.notes || "No notes")}</p>
        </article>
      `;
    })
    .join("");
}

function getCurrentUser() {
  return state.data.users.find((user) => user.id === state.currentUserId) || null;
}

function visibleMoves() {
  return state.data.moves.filter((move) => move.userId === state.currentUserId);
}

function visibleContainers() {
  return state.data.containers.filter((record) => record.userId === state.currentUserId);
}

function visibleItems() {
  return state.data.items.filter((record) => record.userId === state.currentUserId);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function guessRoom(container, photo) {
  const combined = `${container.name} ${container.notes || ""} ${photo.prompt || ""}`.toLowerCase();
  if (combined.includes("kitchen")) return "Kitchen";
  if (combined.includes("bedroom")) return "Bedroom";
  if (combined.includes("office")) return "Office";
  if (combined.includes("garage")) return "Garage";
  return "Mixed";
}

function formatDate(value) {
  if (!value) return "No date";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("No JSON object found in model response.");
  }
  return text.slice(start, end + 1);
}
