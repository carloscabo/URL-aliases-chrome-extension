// Listen when typing in the Omnibox (with the "go" keyword defined in manifest)
chrome.omnibox.onInputEntered.addListener(function(text) {
  navigateToAliasUrl(text.trim());
});

chrome.omnibox.onInputChanged.addListener(function(text, suggest) {
  chrome.storage.sync.get(['aliases'], function(result) {
    const aliases = result.aliases || {};
    const suggestions = Object.entries(aliases)
      .filter(([alias]) => alias.toLowerCase().includes(text.toLowerCase()))
      .map(([alias, data]) => {
        // Handle both old and new formats
        const url = typeof data === 'string' ? data : data.url;
        const searchParams = typeof data === 'string' ? '' : data.searchParams;

        let description = `<match>${alias}</match> → <url>${url}</url>`;

        // Add search info if available
        if (searchParams) {
          description += ` <dim>(supports search: "go ${alias} your search terms")</dim>`;
        }

        return {
          content: alias,
          description: description
        };
      });
    suggest(suggestions);
  });
});

// Listen when a tab is updated to search for secondary keywords
function navigateToAliasUrl(text) {
  console.log('Navigating to alias URL. Input text:', text);

  chrome.storage.sync.get(['aliases'], function(result) {
    const aliases = result.aliases || {};
    console.log('Retrieved aliases from storage:', aliases);

    // Split the input text to check if it has search terms
    const parts = text.split(' ');
    const alias = parts[0].toLowerCase();
    const searchTerms = parts.slice(1).join(' ');

    console.log('Parsed alias:', alias, 'Search terms:', searchTerms);
    console.log('Looking for alias data for:', alias);
    console.log('Aliases[alias]:', aliases[alias]);

    const aliasData = aliases[alias];

    // If alias exists
    if (aliasData) {
      let targetUrl;

      console.log('Alias data type:', typeof aliasData);

      // Handle both old (string) and new (object) formats
      if (typeof aliasData === 'string') {
        targetUrl = aliasData;
        console.log('Using old format. Target URL:', targetUrl);
      } else {
        targetUrl = aliasData.url;
        console.log('Using new format. Base URL:', targetUrl);

        // If search terms are provided and we have search params configured
        if (searchTerms && aliasData.searchParams) {
          const searchUrl = aliasData.searchParams.replace('[SEARCH]', encodeURIComponent(searchTerms));
          console.log('Search params:', aliasData.searchParams);
          console.log('Encoded search terms:', encodeURIComponent(searchTerms));
          console.log('Search URL portion:', searchUrl);
          targetUrl += searchUrl;
          console.log('Final target URL with search:', targetUrl);
        }
      }

      console.log('Navigating to:', targetUrl);
      chrome.tabs.update({ url: targetUrl });
    } else {
      console.log('Alias not found:', alias);
    }
  });
}

// Add a listener to detect when the extension is installed
// or updated to show instructions
chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === "install") {
    console.log("Extension installed, initializing examples...");

    // Add example aliases for first-time users
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

    // Initialize with examples
    chrome.storage.sync.set({ aliases: exampleAliases }, function() {
      console.log('Example aliases initialized:', exampleAliases);

      // Open a tab with basic instructions when installed
      chrome.tabs.create({
        url: "popup.html#instructions"
      });
    });
  }
});
