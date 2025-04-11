document.addEventListener('DOMContentLoaded', async () => {
  // Display version
  const manifest = chrome.runtime.getManifest();
  document.getElementById('version').textContent = `v${manifest.version}`;

  // Check if the extension is in development mode
  const isDevelopmentMode = !('update_url' in manifest);

  // Show reset button if in development mode (remove the hidden class)
  const resetBtn = document.getElementById('resetBtn');
  if (isDevelopmentMode) {
    resetBtn.classList.remove('!hidden');
  }

  // Load existing aliases
  loadAliases();

  // Get current URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  document.getElementById('urlInput').value = tab.url;

  // Event listeners for buttons
  document.getElementById('exportBtn').addEventListener('click', exportAliases);
  document.getElementById('importBtn').addEventListener('click', importAliases);
  document.getElementById('clearBtn').addEventListener('click', clearForm);
  document.getElementById('resetBtn').addEventListener('click', resetToExamples);
  document.getElementById('filterInput').addEventListener('input', filterAliases);
  document.getElementById('clearFilterBtn').addEventListener('click', clearFilter);
  document.getElementById('saveBtn').addEventListener('click', () => {
    // The form submission will be handled by the submit event
    // This is just for backward compatibility
    if (document.getElementById('createForm').checkValidity()) {
      saveNewAlias();
    } else {
      // Trigger HTML5 validation
      document.getElementById('createForm').reportValidity();
    }
  });
  document.getElementById('helpBtn').addEventListener('click', toggleHelpInstructions);
  document.getElementById('closeHelp').addEventListener('click', toggleHelpInstructions);

  // Prevent default form submission and handle it
  document.getElementById('createForm').addEventListener('submit', (e) => {
    e.preventDefault();
    // Form is valid at this point (HTML5 validation)
    saveNewAlias();
  });

  // Real-time alias validation
  document.getElementById('aliasInput').addEventListener('input', validateAlias);

  // Show instructions if it's the first time or if there's a hash in the URL
  if (window.location.hash === '#instructions') {
    toggleHelpInstructions();
    window.location.hash = '';
  }

  // Event delegation for edit and delete buttons
  document.getElementById('aliasList').addEventListener('click', (e) => {
    if (e.target.classList.contains('edit-btn')) {
      const row = e.target.closest('tr');
      startInlineEdit(row);
    } else if (e.target.classList.contains('delete-btn')) {
      const row = e.target.closest('tr');
      const alias = row.dataset.currentAlias;
      showDeleteConfirmation(alias);
    }
  });

  // Event listeners for confirmation dialog
  document.getElementById('cancelDelete').addEventListener('click', () => {
    document.getElementById('deleteConfirmDialog').close();
    document.body.classList.remove('dialog-open');
  });

  document.getElementById('confirmDelete').addEventListener('click', () => {
    const alias = document.getElementById('deleteConfirmDialog').dataset.alias;
    deleteAlias(alias);
    document.getElementById('deleteConfirmDialog').close();
    document.body.classList.remove('dialog-open');
  });
});

function startInlineEdit(row) {
  const currentAlias = row.dataset.currentAlias;
  const currentUrl = row.cells[1].querySelector('a').textContent;
  const currentSearchParams = row.dataset.searchParams || '';

  row.innerHTML = `
    <td>
      <input type="text" class="edit-alias input input-xs" value="${currentAlias}" placeholder="Enter alias" required>
      <div class="error-message">Already exists</div>
    </td>
    <td>
      <input type="text" class="edit-url input input-xs w-full" value="${currentUrl}" placeholder="Enter URL" required>
      <input type="text" class="edit-search-params input input-xs w-full mt-1" value="${currentSearchParams}" placeholder="Search params (optional): /search?q=[SEARCH]">
      <div class="text-xs opacity-60 mt-1">Add [SEARCH] placeholder where the search term should go</div>
    </td>
    <td class="flex gap-1 whitespace-nowrap justify-end">
      <button class="cancel-edit-btn btn btn-xs btn-outline btn-error">Cancel</button>
      <button class="save-edit-btn btn btn-xs btn-outline btn-accent">Save</button>
    </td>
  `;

  // Add validation for the edit alias input
  const aliasInput = row.querySelector('.edit-alias');
  aliasInput.addEventListener('input', function() {
    validateEditAlias(this, currentAlias);
  });

  // Add event to "Cancel" button
  row.querySelector('.cancel-edit-btn').addEventListener('click', () => {
    loadAliases(); // Reload the list to cancel editing
  });

  // Add event to "Save" button
  row.querySelector('.save-edit-btn').addEventListener('click', () => {
    const urlInput = row.querySelector('.edit-url');
    // Trigger HTML5 validation
    if (!aliasInput.checkValidity()) {
      aliasInput.reportValidity();
      return;
    }
    if (!urlInput.checkValidity()) {
      urlInput.reportValidity();
      return;
    }
    saveInlineEdit(row);
  });
}

function validateEditAlias(input, currentAlias) {
  const newAlias = input.value.trim();
  const errorMessage = input.nextElementSibling;
  const saveButton = input.closest('tr').querySelector('button:last-child');

  if (!newAlias) {
    input.classList.remove('error');
    errorMessage.classList.remove('visible');
    saveButton.disabled = false;
    return;
  }

  // Only validate if the alias has changed
  if (newAlias !== currentAlias) {
    chrome.storage.sync.get(['aliases'], function(result) {
      const aliases = result.aliases || {};
      const exists = newAlias in aliases;

      input.classList.toggle('error', exists);
      errorMessage.classList.toggle('visible', exists);
      saveButton.disabled = exists;
    });
  } else {
    input.classList.remove('error');
    errorMessage.classList.remove('visible');
    saveButton.disabled = false;
  }
}

function saveInlineEdit(row) {
  const aliasInput = row.querySelector('.edit-alias');
  const urlInput = row.querySelector('.edit-url');
  const searchParamsInput = row.querySelector('.edit-search-params');
  const newAlias = aliasInput.value.trim();
  const newUrl = urlInput.value.trim();
  const currentAlias = row.dataset.currentAlias;
  const currentSearchParams = row.dataset.searchParams || '';

  // Check validity of both inputs
  if (!aliasInput.checkValidity() || !urlInput.checkValidity()) {
    return;
  }

  // Ensure URL has the correct format
  let formattedUrl = newUrl;
  if (!/^https?:\/\//i.test(newUrl)) {
    formattedUrl = 'https://' + newUrl;
  }

  chrome.storage.sync.get(['aliases'], function(result) {
    const aliases = result.aliases || {};

    // If the alias has changed, delete the old one and add the new one
    if (newAlias !== currentAlias) {
      delete aliases[currentAlias];
    }

    aliases[newAlias] = {
      url: formattedUrl,
      searchParams: searchParamsInput.value.trim() || currentSearchParams
    };
    chrome.storage.sync.set({ aliases }, function() {
      loadAliases();
    });
  });
}

function validateAlias() {
  const aliasInput = document.getElementById('aliasInput');
  const aliasError = document.getElementById('aliasError');
  const saveButton = document.getElementById('saveBtn');
  const alias = aliasInput.value.trim();

  if (!alias) {
    aliasInput.classList.remove('error');
    aliasError.classList.remove('visible');
    saveButton.disabled = false;
    return;
  }

  chrome.storage.sync.get(['aliases'], function(result) {
    const aliases = result.aliases || {};
    const exists = alias in aliases;

    aliasInput.classList.toggle('error', exists);
    aliasError.classList.toggle('visible', exists);
    saveButton.disabled = exists;
  });
}

// Variables for the search functionality
let fuseInstance;
let allAliases = [];

function loadAliases() {
  chrome.storage.sync.get(['aliases'], function(result) {
    const aliases = result.aliases || {};

    // Store all aliases for filtering
    allAliases = Object.entries(aliases).map(([alias, data]) => {
      // Handle both new and old format
      const url = typeof data === 'string' ? data : data.url;
      const searchParams = typeof data === 'string' ? '' : (data.searchParams || '');

      return {
        alias,
        url,
        searchParams,
        data  // Keep the original data for rendering
      };
    }).sort((a, b) => a.alias.toLowerCase().localeCompare(b.alias.toLowerCase()));

    // Initialize Fuse.js for fuzzy search
    fuseInstance = new Fuse(allAliases, {
      keys: ['alias', 'url'],
      threshold: 0.4,
      includeScore: true
    });

    // Display aliases (initially unfiltered)
    displayAliases(allAliases);

    // Clear any existing filter
    document.getElementById('filterInput').value = '';
    document.getElementById('clearFilterBtn').classList.add('hidden');
  });
}

function displayAliases(aliasesToDisplay) {
  const aliasList = document.getElementById('aliasList');
  aliasList.innerHTML = '';

  aliasesToDisplay.forEach(item => {
    const { alias, url, searchParams, data } = item;

    const row = document.createElement('tr');
    row.dataset.currentAlias = alias;
    row.dataset.searchParams = searchParams;

    row.innerHTML = `
      <td>${alias}</td>
      <td class="break-all">
        <a href="${url}" target="_blank" class="hover:underline">${url}</a>
        ${searchParams ?
        `<div class="text-xs pt-1">
          <span class="font-semibold opacity-70">Search params:</span> ${searchParams}
         </div>` : ''}
      </td>
      <td class="flex gap-1 whitespace-nowrap justify-end">
        <button class="edit-btn btn btn-xs btn-soft btn-outline">Edit</button>
        <button class="delete-btn btn btn-xs btn-outline btn-error">Delete</button>
      </td>
    `;

    aliasList.appendChild(row);
  });

  // Update count if we're filtering
  const filterInput = document.getElementById('filterInput');
  if (filterInput.value.trim()) {
    const count = aliasesToDisplay.length;
    const total = allAliases.length;
    filterInput.placeholder = `Showing ${count} of ${total} aliases`;
  } else {
    filterInput.placeholder = "Filter aliases...";
  }
}

function filterAliases() {
  const filterInput = document.getElementById('filterInput');
  const query = filterInput.value.trim();
  const clearFilterBtn = document.getElementById('clearFilterBtn');

  if (query) {
    // Show the clear button
    clearFilterBtn.classList.remove('hidden');

    // Perform fuzzy search
    const results = fuseInstance.search(query);

    // Display filtered results
    displayAliases(results.map(result => result.item));
  } else {
    // Hide the clear button
    clearFilterBtn.classList.add('hidden');

    // Display all aliases
    displayAliases(allAliases);
  }
}

function clearFilter() {
  const filterInput = document.getElementById('filterInput');
  filterInput.value = '';
  filterInput.focus();
  filterAliases();
}

function clearForm() {
  document.getElementById('aliasInput').value = '';
  document.getElementById('urlInput').value = '';
  document.getElementById('searchParamsInput').value = '';
  document.getElementById('aliasInput').classList.remove('error');
  document.getElementById('aliasError').classList.remove('visible');
  document.getElementById('saveBtn').disabled = false;
  document.getElementById('aliasInput').focus();
}

function clearNewAliasForm() {
  clearForm(); // Reuse the clearForm function for consistency
}

function saveNewAlias() {
  const alias = document.getElementById('aliasInput').value.trim();
  const url = document.getElementById('urlInput').value.trim();
  const searchParams = document.getElementById('searchParamsInput').value.trim();

  // Ensure URL has the correct format
  let formattedUrl = url;
  if (!/^https?:\/\//i.test(url)) {
    formattedUrl = 'https://' + url;
  }

  saveAlias(alias, formattedUrl, searchParams);
  clearForm();
}

function saveAlias(alias, url, searchParams = '') {
  chrome.storage.sync.get(['aliases'], function(result) {
    const aliases = result.aliases || {};
    aliases[alias] = {
      url: url,
      searchParams: searchParams
    };
    chrome.storage.sync.set({ aliases }, function() {
      loadAliases();
    });
  });
}

function showDeleteConfirmation(alias) {
  const dialog = document.getElementById('deleteConfirmDialog');
  document.getElementById('deleteAliasName').textContent = alias;
  dialog.dataset.alias = alias;
  dialog.showModal();
  document.body.classList.add('dialog-open');
}

function deleteAlias(alias) {
  chrome.storage.sync.get(['aliases'], function(result) {
    const aliases = result.aliases || {};
    delete aliases[alias];
    chrome.storage.sync.set({ aliases }, function() {
      loadAliases();
    });
  });
}

function exportAliases() {
  chrome.storage.sync.get(['aliases'], function(result) {
    const aliases = result.aliases || {};
    const blob = new Blob([JSON.stringify(aliases, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Create filename with current date and time
    const now = new Date();
    const dateStr = now.toISOString()
      .replace(/T/, '-')
      .replace(/\..+/, '')
      .replace(/:/g, '');
    const filename = `${dateStr}-url-aliases.json`;

    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function importAliases() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const importedAliases = JSON.parse(e.target.result);

        // Verify and convert to the new format
        const aliases = {};
        Object.entries(importedAliases).forEach(([alias, data]) => {
          if (typeof data === 'string') {
            // Old format: just a URL string
            let formattedUrl = data;
            if (!/^https?:\/\//i.test(data)) {
              formattedUrl = 'https://' + data;
            }
            aliases[alias] = {
              url: formattedUrl,
              searchParams: ''
            };
          } else if (typeof data === 'object') {
            // New format or partial format
            let url = data.url || '';
            if (url && !/^https?:\/\//i.test(url)) {
              url = 'https://' + url;
            }
            aliases[alias] = {
              url: url,
              searchParams: data.searchParams || ''
            };
          }
        });

        chrome.storage.sync.set({ aliases }, function() {
          loadAliases();
        });
      } catch (error) {
        alert('Error importing file. Make sure it is a valid JSON file.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function toggleHelpInstructions() {
  const helpDialog = document.getElementById('helpDialog');
  if (helpDialog.open) {
    helpDialog.close();
    document.body.classList.remove('dialog-open');
  } else {
    helpDialog.showModal();
    document.body.classList.add('dialog-open');
  }
}

// Function to reset to example aliases
function resetToExamples() {
  const exampleAliases = {
    "g": {
      url: "https://www.google.com",
      searchParams: "/search?q=[SEARCH]"
    },
    "yt": {
      url: "https://www.youtube.com",
      searchParams: "/results?search_query=[SEARCH]"
    },
    "wiki": {
      url: "https://en.wikipedia.org",
      searchParams: "/wiki/Special:Search?search=[SEARCH]"
    }
  };

  chrome.storage.sync.set({ aliases: exampleAliases }, function() {
    console.log('Reset to example aliases');
    loadAliases();
  });
}
