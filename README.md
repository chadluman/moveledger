# MoveLedger

MoveLedger is a moving inventory application for organizing customer moves, containers,
itemized contents, photos, and printable inventory records. The Node.js backend stores
customer data and sessions in MongoDB.

## Features

- Separate, persistent inventory records for each customer account
- Move, container, and item tracking
- Search across item names, rooms, notes, and container locations
- Photo evidence attached to containers
- Optional AI-assisted photo inventory
- Itemized print/PDF records with one QR code and available photos
- Password hashing, HTTP-only sessions, and server-enforced customer ownership

## Requirements

- Node.js 20.19 or newer
- npm
- MongoDB Community Server or a MongoDB Atlas cluster

## Local Setup

1. Open `moveledger-vscode-ready.code-workspace` in VS Code, or open this project folder.
2. Install the project dependency:

```powershell
npm install
```

3. Make sure MongoDB is running. For a default local MongoDB installation, the connection
   string is `mongodb://127.0.0.1:27017`.
4. Create the local environment file:

```powershell
Copy-Item .env.example .env
```

5. Update `.env` when using a different MongoDB host or database:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DATABASE=moveledger
PORT=5510
```

Do not commit `.env`. It is ignored by Git and may contain database credentials.

## Start the App

From a terminal:

```powershell
npm start
```

Alternatively, run the VS Code task named `Start MoveLedger`.

Open [http://localhost:5510](http://localhost:5510). Use this address instead of VS Code's
**Go Live** action. Live Server only serves frontend files and cannot provide the authenticated
MongoDB API.

Check the backend and MongoDB connection at
[http://localhost:5510/api/health](http://localhost:5510/api/health). A healthy response is:

```json
{"ok":true,"database":"mongodb"}
```

Stop the app with `Ctrl+C` in the terminal running the server.

## Demo Account

- Email: `demo@moveledger.app`
- Password: `demo1234`

The demo account and sample move are created automatically when the database is first used.
You can also select **Need an account?** to register a separate customer.

## How to Use MoveLedger

1. Log in with the demo account or create a customer account.
2. Under **New Move**, enter the move name, origin, destination, and move date.
3. Open the move and create a container for each box, tote, or crate.
4. Add item names, quantities, rooms or categories, and notes to each container.
5. Upload container photos when visual documentation is needed.
6. Use **AI Identify Latest Photo** to suggest items from the newest photo. This is optional.
7. Use **Global Search** to locate an item across the signed-in customer's moves.
8. Use **Print / Save PDF** on a container to create an itemized inventory record. In the
   browser print dialog, choose **Save as PDF** to create a PDF file.
9. Log out when finished. Moves remain stored in MongoDB for the next login.

## Optional AI Setup

The AI photo feature accepts an OpenAI API key through the **AI Settings** panel. The current
MVP stores that key only in the browser and does not write it to MongoDB. For a production
deployment, proxy AI requests through the backend and store the key in a server environment
variable.

## Project Structure

- `src/index.html` - application markup
- `src/styles.css` - interface and print styling
- `src/app.js` - browser state, API calls, inventory workflow, and PDF layout
- `server.js` - static server, authentication API, MongoDB collections, and sessions
- `.env.example` - local configuration template
- `.vscode/` - VS Code settings and startup task

## MongoDB Data

MoveLedger uses the following collections:

- `users`
- `moves`
- `containers`
- `items`
- `photos`
- `sessions`

Passwords are hashed with Node.js `scrypt`. Session cookies are HTTP-only, session records
expire automatically through a MongoDB TTL index, and writes are forced to the authenticated
customer ID.

## Troubleshooting

### Backend connection error

Confirm that you opened `http://localhost:5510`, not a VS Code Live Server URL. Then check:

```powershell
Invoke-RestMethod http://localhost:5510/api/health
```

### MongoDB connection error

Confirm that the MongoDB service is running and that `MONGODB_URI` in `.env` is correct:

```powershell
Get-Service MongoDB
```

### Port 5510 is already in use

Choose another port in `.env`, restart the server, and open the matching URL.

## Production Notes

For production, use MongoDB Atlas, HTTPS, a restrictive network allowlist, managed secret
storage, and object storage for uploaded photos. The current local server is intended as a
portfolio-ready foundation rather than a complete production deployment.
