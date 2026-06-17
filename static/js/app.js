// --- App State ---
let allReleases = [];
let filteredReleases = [];
let activeCategory = 'all';
let searchQuery = '';
let currentTweetItem = null;

// --- DOM Elements ---
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const refreshFeedBtn = document.getElementById('refresh-feed-btn');
const resetFiltersBtn = document.getElementById('reset-filters-btn');
const categoryFiltersContainer = document.getElementById('category-filters-container');
const emptyState = document.getElementById('empty-state');
const skeletonLoader = document.getElementById('skeleton-loader');
const releasesFeed = document.getElementById('releases-feed');
const syncStatusText = document.getElementById('sync-status-text');
const syncStatusDot = document.querySelector('.status-dot');

// Modal Elements
const tweetModal = document.getElementById('tweet-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelTweetBtn = document.getElementById('cancel-tweet-btn');
const publishTweetBtn = document.getElementById('publish-tweet-btn');
const tweetTextarea = document.getElementById('tweet-textarea');
const charCountSpan = document.getElementById('char-count');
const lengthWarning = document.getElementById('length-warning');
const twitterPreviewText = document.getElementById('twitter-preview-text');
const mockTweetTime = document.getElementById('mock-tweet-time');
const progressIndicator = document.getElementById('progress-indicator');

// --- Helper Functions ---

// Strip HTML tags to get raw text
function stripHtml(html) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    // Replace <br>, </p>, </h3> with newlines to keep formatting clean
    let text = tempDiv.innerHTML
        .replace(/<\/p>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/h3>/gi, '\n')
        .replace(/<li>/gi, '• ')
        .replace(/<\/li>/gi, '\n');
    
    const cleanDiv = document.createElement("div");
    cleanDiv.innerHTML = text;
    return cleanDiv.textContent || cleanDiv.innerText || "";
}

// Format Date string to human readable format
function formatDate(dateStr) {
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    } catch {
        return dateStr;
    }
}

// Calculate tweet length honoring X's URL counting rules (any URL counts as 23 chars)
function calculateTweetLength(text) {
    const urlRegex = /https?:\/\/[^\s]+/g;
    // Replace all URLs with a 23-character string to simulate Twitter's t.co wrapping
    const textWithNormalizedUrls = text.replace(urlRegex, "a".repeat(23));
    return textWithNormalizedUrls.length;
}

// --- API Calls ---

async function fetchReleaseNotes(forceRefresh = false) {
    // Show spinner & loading state
    refreshFeedBtn.classList.add('loading');
    skeletonLoader.style.display = 'block';
    releasesFeed.style.display = 'none';
    emptyState.style.display = 'none';
    
    syncStatusDot.className = 'status-dot syncing';
    syncStatusText.textContent = forceRefresh ? 'Fetching fresh feed...' : 'Checking updates...';

    const url = `/api/releases${forceRefresh ? '?refresh=true' : ''}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.success && data.releases) {
            allReleases = data.releases;
            
            // Format last updated status
            const updatedTime = new Date(data.last_updated);
            const formattedTime = updatedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            syncStatusDot.className = 'status-dot';
            syncStatusText.textContent = `Synced at ${formattedTime}`;
            
            // Render category filters metadata
            updateCategoryCounts();
            
            // Filter and render timeline
            filterAndRender();
        } else {
            throw new Error(data.error || 'Unknown server error');
        }
    } catch (error) {
        console.error('Failed to retrieve release notes:', error);
        syncStatusDot.className = 'status-dot error';
        syncStatusText.textContent = 'Sync Failed';
        
        // Show empty state if we have no fallback data
        if (allReleases.length === 0) {
            releasesFeed.innerHTML = '';
            emptyState.style.display = 'block';
        }
    } finally {
        refreshFeedBtn.classList.remove('loading');
        skeletonLoader.style.display = 'none';
    }
}

// --- Categorization Helpers ---
function getCategoryKey(category) {
    const cat = category.toLowerCase();
    if (cat === 'feature') return 'Feature';
    if (cat === 'announcement') return 'Announcement';
    if (cat === 'issue') return 'Issue';
    return 'Other'; // for Deprecated, Changed, etc.
}

// --- Counting Categories ---
function updateCategoryCounts() {
    let counts = {
        all: 0,
        Feature: 0,
        Announcement: 0,
        Issue: 0,
        Other: 0
    };

    allReleases.forEach(day => {
        day.items.forEach(item => {
            counts.all++;
            const key = getCategoryKey(item.category);
            counts[key]++;
        });
    });

    document.getElementById('count-all').textContent = counts.all;
    document.getElementById('count-feature').textContent = counts.Feature;
    document.getElementById('count-announcement').textContent = counts.Announcement;
    document.getElementById('count-issue').textContent = counts.Issue;
    document.getElementById('count-other').textContent = counts.Other;
}

// --- Filtering and Rendering Logic ---

function filterAndRender() {
    filteredReleases = [];

    allReleases.forEach(day => {
        // Filter items within the day
        const matchingItems = day.items.filter(item => {
            // Category check
            if (activeCategory !== 'all') {
                const itemKey = getCategoryKey(item.category);
                if (itemKey !== activeCategory) return false;
            }

            // Search query check
            if (searchQuery) {
                const plainText = stripHtml(item.html).toLowerCase();
                const categoryText = item.category.toLowerCase();
                const dateText = day.date.toLowerCase();
                const query = searchQuery.toLowerCase();
                
                return plainText.includes(query) || 
                       categoryText.includes(query) || 
                       dateText.includes(query);
            }

            return true;
        });

        if (matchingItems.length > 0) {
            filteredReleases.push({
                ...day,
                items: matchingItems
            });
        }
    });

    renderTimeline();
}

function renderTimeline() {
    releasesFeed.innerHTML = '';

    if (filteredReleases.length === 0) {
        releasesFeed.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    releasesFeed.style.display = 'flex';

    filteredReleases.forEach(day => {
        const dayGroup = document.createElement('div');
        dayGroup.className = 'day-group';

        // Timeline dot
        const dayDot = document.createElement('div');
        dayDot.className = 'day-dot';
        dayGroup.appendChild(dayDot);

        // Header for the date
        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        
        const dayDate = document.createElement('h2');
        dayDate.className = 'day-date';
        dayDate.textContent = formatDate(day.date);
        dayHeader.appendChild(dayDate);
        dayGroup.appendChild(dayHeader);

        // Container for releases of that day
        const dayReleases = document.createElement('div');
        dayReleases.className = 'day-releases';

        day.items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'release-card';

            const cardHeader = document.createElement('div');
            cardHeader.className = 'card-header';

            // Category badge
            const badge = document.createElement('span');
            const catKey = getCategoryKey(item.category).toLowerCase();
            badge.className = `category-badge ${catKey}`;
            badge.textContent = item.category;
            cardHeader.appendChild(badge);
            card.appendChild(cardHeader);

            // Card Body (HTML description)
            const content = document.createElement('div');
            content.className = 'card-content';
            content.innerHTML = item.html;
            card.appendChild(content);

            // Card Footer / Actions
            const cardFooter = document.createElement('div');
            cardFooter.className = 'card-footer';

            // Official Release notes link
            if (day.link) {
                const docsBtn = document.createElement('a');
                docsBtn.className = 'btn btn-secondary btn-card';
                docsBtn.href = day.link;
                docsBtn.target = '_blank';
                docsBtn.rel = 'noopener noreferrer';
                docsBtn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    <span>View Docs</span>
                `;
                cardFooter.appendChild(docsBtn);
            }

            // Tweet Update button
            const tweetBtn = document.createElement('button');
            tweetBtn.className = 'btn btn-card tweet-btn';
            tweetBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                <span>Tweet</span>
            `;
            tweetBtn.addEventListener('click', () => openTweetModal(day.date, day.link, item));
            cardFooter.appendChild(tweetBtn);

            card.appendChild(cardFooter);
            dayReleases.appendChild(card);
        });

        dayGroup.appendChild(dayReleases);
        releasesFeed.appendChild(dayGroup);
    });
}

// --- Tweet Composer Dialog Modal ---

function openTweetModal(dateStr, docLink, item) {
    currentTweetItem = { dateStr, docLink, item };
    
    // Clear styles
    tweetTextarea.classList.remove('error');
    lengthWarning.style.display = 'none';

    // Format prefilled tweet contents
    const category = item.category;
    const rawText = stripHtml(item.html).replace(/\s+/g, ' ').trim();
    const formattedDate = formatDate(dateStr);
    
    // Header template
    const header = `📢 [${category}] BigQuery Update (${formattedDate}):\n`;
    // Footer template (Twitter converts URLs into 23 characters)
    const footer = docLink ? `\n\nNotes: ${docLink} #BigQuery` : `\n\n#BigQuery #GoogleCloud`;
    
    // Calculate space left for the main body
    const reservedChars = calculateTweetLength(header) + calculateTweetLength(footer);
    const maxBodyChars = 280 - reservedChars;
    
    let tweetBody = rawText;
    if (rawText.length > maxBodyChars) {
        tweetBody = rawText.substring(0, maxBodyChars - 3) + '...';
    }
    
    const fullPrefilledText = `${header}${tweetBody}${footer}`;
    
    // Set text in editor
    tweetTextarea.value = fullPrefilledText;
    
    // Set mock card datetime
    mockTweetTime.textContent = new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });

    // Update statistics and modal UI states
    updateTweetComposerState();

    // Show modal
    tweetModal.classList.add('active');
    tweetModal.setAttribute('aria-hidden', 'false');
    tweetTextarea.focus();
}

function closeTweetModal() {
    tweetModal.classList.remove('active');
    tweetModal.setAttribute('aria-hidden', 'true');
    currentTweetItem = null;
}

function updateTweetComposerState() {
    const text = tweetTextarea.value;
    const len = calculateTweetLength(text);
    
    charCountSpan.textContent = len;
    
    // Update live preview block
    // Basic regex conversion for links in live preview
    const linkifiedText = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
    twitterPreviewText.innerHTML = linkifiedText;

    // Progress ring indicators (SVG circle offset)
    const radius = 10;
    const circumference = 2 * Math.PI * radius; // 62.83
    
    const percentage = Math.min((len / 280) * 100, 100);
    const offset = circumference - (percentage / 100) * circumference;
    
    progressIndicator.style.strokeDasharray = `${circumference} ${circumference}`;
    progressIndicator.style.strokeDashoffset = offset;

    // Change indicator color if limit is exceeded
    if (len > 280) {
        progressIndicator.style.stroke = 'var(--color-issue)';
        charCountSpan.parentElement.classList.add('danger');
        lengthWarning.style.display = 'block';
        publishTweetBtn.disabled = true;
        publishTweetBtn.style.opacity = 0.5;
        publishTweetBtn.style.pointerEvents = 'none';
    } else {
        progressIndicator.style.stroke = len > 260 ? '#f59e0b' : 'var(--accent-blue)';
        charCountSpan.parentElement.classList.remove('danger');
        lengthWarning.style.display = 'none';
        publishTweetBtn.disabled = false;
        publishTweetBtn.style.opacity = 1;
        publishTweetBtn.style.pointerEvents = 'auto';
    }
}

// --- Event Listeners ---

// Setup category filters click events
categoryFiltersContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    
    // Remove active state from other filters
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    
    // Make this filter active
    btn.classList.add('active');
    activeCategory = btn.dataset.category;
    
    filterAndRender();
});

// Search input interaction
searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    clearSearchBtn.style.display = searchQuery ? 'flex' : 'none';
    filterAndRender();
});

clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.style.display = 'none';
    searchInput.focus();
    filterAndRender();
});

// Refresh button interaction
refreshFeedBtn.addEventListener('click', () => {
    fetchReleaseNotes(true);
});

// Reset filter state
resetFiltersBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.style.display = 'none';
    
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('filter-btn-all').classList.add('active');
    activeCategory = 'all';
    
    filterAndRender();
});

// Tweet Modal events
closeModalBtn.addEventListener('click', closeTweetModal);
cancelTweetBtn.addEventListener('click', closeTweetModal);

tweetModal.addEventListener('click', (e) => {
    if (e.target === tweetModal) closeTweetModal();
});

tweetTextarea.addEventListener('input', updateTweetComposerState);

publishTweetBtn.addEventListener('click', () => {
    const text = tweetTextarea.value;
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(tweetUrl, '_blank', 'noopener,noreferrer');
    closeTweetModal();
});

// Keyboard Accessibility
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tweetModal.classList.contains('active')) {
        closeTweetModal();
    }
});

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Initial fetch on page load
    fetchReleaseNotes(false);
});
