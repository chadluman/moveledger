# MoveLedger VS Code Project

Clean VS Code-ready packaging of the MoveLedger MVP.

## Folder structure

- `src/` app files
- `.vscode/` workspace settings and task
- `server.js` tiny local static server
- `package.json` simple run scripts

## Open in VS Code

Open this folder in VS Code:

`C:\Users\Luman\OneDrive\Desktop\hot air balloon\packing and logging app\moveledger-vscode-ready`

You can also open the workspace file:

`moveledger-vscode-ready.code-workspace`

## Run locally

### Option 1: VS Code task

Run the `Start MoveLedger` task.

### Option 2: terminal

```bash
npm run start
```

Then open:

[http://localhost:5500](http://localhost:5500)

## Demo login

- `demo@moveledger.app`
- `demo1234`

## Notes

- This is still a browser-storage MVP.
- The optional OpenAI key field stores the key locally in the browser for demo purposes only.
- A production version should move auth, file storage, and AI calls to a backend.
