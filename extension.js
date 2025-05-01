const vscode = require('vscode');
const path = require('path');
const fs = require('fs').promises;

let KEY_PRESS_DATA_FILE; 
let currentPanel = undefined;
let plantHealthPercentage = 100;
let plantImages = [];
let contextGlobal;
let keyPressCounts = {};

async function saveKeyPressData() {
  try {
    await fs.writeFile(KEY_PRESS_DATA_FILE, JSON.stringify(keyPressCounts, null, 2));
    console.log('Key press data saved successfully.');
  } catch (error) {
    console.error('Error saving key press data:', error);
  }
}

async function loadKeyPressData() {
  try {
    const data = await fs.readFile(KEY_PRESS_DATA_FILE, 'utf8');
    keyPressCounts = JSON.parse(data);
    console.log('Key press data loaded successfully.');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('Key press data file not found. Starting fresh.');
      keyPressCounts = {};
    } else {
      console.error('Error loading key press data:', error);
    }
  }
}

function updatePlantState() {
  if (currentPanel && currentPanel.webview) {
    console.log('updatePlantState called. Current health percentage:', plantHealthPercentage);
    const index = Math.floor(plantHealthPercentage / 25);
    const currentPlantImage = plantImages[Math.min(index, plantImages.length - 1)];
    const currentPlantImageUri = currentPanel.webview.asWebviewUri(vscode.Uri.file(currentPlantImage));

    console.log('Calculated plant image index:', index, 'Image URI:', currentPlantImageUri.toString());

    currentPanel.webview.postMessage({
      command: 'updatePlant',
      health: plantHealthPercentage,
      imageUri: currentPlantImageUri.toString()
    });
  }
}

function updateKeyPressData() {
  if (currentPanel && currentPanel.webview) {
    const sortedKeys = Object.entries(keyPressCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    console.log('Updating key press data:', sortedKeys); 

    currentPanel.webview.postMessage({
      command: 'updateKeyPressData',
      topKeys: sortedKeys
    });
  } else {
    console.log('Webview is not available to update key press data.');
  }
}

async function activate(context) {
  contextGlobal = context;

  KEY_PRESS_DATA_FILE = path.join(contextGlobal.globalStorageUri.fsPath, 'keyPressData.json');

  plantImages = [
    context.asAbsolutePath(path.join('media', 'dead.png')),
    context.asAbsolutePath(path.join('media', 'bad_plant.png')),
    context.asAbsolutePath(path.join('media', 'play.png')),
    context.asAbsolutePath(path.join('media', 'play.png')),
    context.asAbsolutePath(path.join('media', 'small_plant.png')),
  ];

  await fs.mkdir(context.globalStorageUri.fsPath, { recursive: true });

  await loadKeyPressData();

  vscode.window.registerWebviewViewProvider('coderootsView', {
    resolveWebviewView: (webviewView, context) => {
      console.log('resolveWebviewView called. Setting up webview.');

      currentPanel = webviewView;
      console.log('Webview assigned to currentPanel:', currentPanel);

      try {
        const extensionPath = context?.extensionPath || contextGlobal?.extensionPath;
        if (!extensionPath) {
          throw new Error('Extension path is undefined.');
        }
        console.log('Resolved extensionPath:', extensionPath);

        const testUri = vscode.Uri.file(extensionPath);
        console.log('Test URI:', testUri.toString());

        webviewView.webview.options = {
          enableScripts: true,
          localResourceRoots: [testUri]
        };

        const initialImageUri = webviewView.webview.asWebviewUri(vscode.Uri.file(plantImages[plantImages.length - 1]));
        webviewView.webview.html = `<!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Plant Health</title>
          <style>
            body {
              font-family: sans-serif;
              color: var(--vscode-foreground);
              background-color: var(--vscode-panel-background);
              margin: 0;
              padding: 10px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: flex-start;
              height: 100%;
            }
            img {
              display: block;
              max-width: 80%;
              max-height: 60%;
              object-fit: contain;
            }
            .health-bar-container {
              width: 80%;
              background-color: var(--vscode-editor-background);
              border: 1px solid var(--vscode-contrastActiveBorder);
              border-radius: 5px;
              margin-top: 15px;
              overflow: hidden;
            }
            .health-bar {
              background-color: green;
              height: 20px;
              width: 100%;
              border-radius: 5px;
            }
            .health-text {
              margin-top: 5px;
              font-size: 1.1em;
              font-weight: bold;
            }
            .key-press-container {
              margin-top: 20px;
              width: 80%;
              text-align: left;
            }
            .key-press-container h3 {
              margin-bottom: 10px;
            }
            .key-press-list {
              list-style: none;
              padding: 0;
            }
            .key-press-list li {
              margin: 5px 0;
            }
          </style>
        </head>
        <body>
          <img src="${initialImageUri}" alt="Plant Image">
          <div class="health-text">Health: 100%</div>
          <div class="health-bar-container">
            <div class="health-bar" style="width: 100%;"></div>
          </div>
          <div class="key-press-container">
            <h3>Top 10 Most Pressed Keys</h3>
            <ul class="key-press-list"></ul>
          </div>

          <script>
            const vscode = acquireVsCodeApi();
            const plantImage = document.querySelector('img');
            const healthBar = document.querySelector('.health-bar');
            const healthText = document.querySelector('.health-text');
            const keyPressList = document.querySelector('.key-press-list');

            window.addEventListener('message', event => {
              const message = event.data;
              if (message.command === 'updatePlant') {
                plantImage.src = message.imageUri + '?t=' + new Date().getTime();
                healthBar.style.width = message.health + '%';
                healthText.textContent = 'Health: ' + Math.round(message.health) + '%';
                healthBar.style.backgroundColor = getHealthColor(message.health);
              } else if (message.command === 'updateKeyPressData') {
                console.log('Received key press data:', message.topKeys);
                keyPressList.innerHTML = '';
                message.topKeys.forEach(([key, count]) => {
                  const listItem = document.createElement('li');
                  listItem.textContent = key + ': ' + count;
                  keyPressList.appendChild(listItem);
                });
              }
            });

            function getHealthColor(health) {
              if (health > 70) return 'green';
              if (health > 30) return 'orange';
              return 'red';
            }
          </script>
        </body>
        </html>`;
        console.log('Webview HTML set successfully with dynamic content.');
      } catch (error) {
        console.error('Error setting up webview:', error);
      }

      webviewView.webview.onDidReceiveMessage(() => {
      }, undefined, context.subscriptions);

      updatePlantState();
    }
  }, { webviewOptions: { retainContextWhenHidden: true } });

  vscode.languages.onDidChangeDiagnostics(event => {
    console.log('Diagnostics changed:', event.uris);
    let errorCount = 0;
    let warningCount = 0;
    for (const uri of event.uris) {
      const diagnostics = vscode.languages.getDiagnostics(uri);
      console.log('Diagnostics for', uri.toString(), diagnostics);
      for (const diagnostic of diagnostics) {
        if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
          errorCount++;
        } else if (diagnostic.severity === vscode.DiagnosticSeverity.Warning) {
          warningCount++;
        }
      }
    }
    const totalIssues = errorCount * 2 + warningCount;
    plantHealthPercentage = Math.max(0, 100 - (totalIssues * 5));
    console.log('Updated plant health percentage:', plantHealthPercentage);
    updatePlantState();
  });

  vscode.workspace.onDidChangeTextDocument(event => {
    const text = event.contentChanges.map(change => change.text).join('');
    for (const char of text) {
      if (char.trim()) {
        keyPressCounts[char] = (keyPressCounts[char] || 0) + 1;
      }
    }
    console.log('Key press counts updated:', keyPressCounts);
    updateKeyPressData();
  });
}

async function deactivate() {
  await saveKeyPressData();
}

module.exports = { activate, deactivate };