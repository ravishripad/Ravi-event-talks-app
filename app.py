import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from flask import Flask, jsonify, render_template, request
import requests

app = Flask(__name__)

# Feed URL
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

# In-memory cache
cache = {
    "data": None,
    "last_updated": None
}
CACHE_DURATION = timedelta(minutes=15)

def parse_html_content(content_html):
    """
    Parses the CDATA HTML content of an Atom entry.
    BigQuery release notes are structured using <h3> headings for update categories,
    followed by <p> paragraphs or <ul> lists for details.
    """
    if not content_html:
        return []

    # Split the HTML by <h3>...</h3> tags, capturing the tag contents
    parts = re.split(r'<h3>(.*?)</h3>', content_html)
    items = []
    
    if len(parts) > 1:
        # parts[0] is the text before the first <h3> (usually whitespace)
        for i in range(1, len(parts), 2):
            category = parts[i].strip()
            item_html = parts[i+1].strip() if i+1 < len(parts) else ""
            
            # Clean up the HTML wrapper if any
            items.append({
                "category": category,
                "html": item_html
            })
    else:
        # Fallback if no <h3> tags are found
        items.append({
            "category": "Update",
            "html": content_html.strip()
        })
        
    return items

def fetch_and_parse_feed():
    """
    Fetches the BigQuery Release Notes Atom XML feed and parses it.
    """
    response = requests.get(FEED_URL, timeout=15)
    response.raise_for_status()
    
    # Parse XML
    root = ET.fromstring(response.content)
    namespaces = {'atom': 'http://www.w3.org/2005/Atom'}
    
    entries = []
    for entry in root.findall('atom:entry', namespaces):
        title = entry.find('atom:title', namespaces).text
        updated = entry.find('atom:updated', namespaces).text
        
        # Link resolution
        link_elem = entry.find('atom:link[@rel="alternate"]', namespaces)
        if link_elem is None:
            link_elem = entry.find('atom:link', namespaces)
        link = link_elem.attrib.get('href') if link_elem is not None else ""
        
        content = entry.find('atom:content', namespaces).text
        parsed_items = parse_html_content(content)
        
        entries.append({
            "date": title,
            "updated": updated,
            "link": link,
            "items": parsed_items
        })
        
    return entries

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/releases")
def get_releases():
    force_refresh = request.args.get("refresh", "false").lower() == "true"
    now = datetime.now()
    
    # Use cached data if available and not expired/forced
    if (not force_refresh and 
        cache["data"] is not None and 
        cache["last_updated"] is not None and 
        now - cache["last_updated"] < CACHE_DURATION):
        return jsonify({
            "success": True,
            "source": "cache",
            "last_updated": cache["last_updated"].isoformat(),
            "releases": cache["data"]
        })
        
    try:
        releases = fetch_and_parse_feed()
        cache["data"] = releases
        cache["last_updated"] = now
        return jsonify({
            "success": True,
            "source": "network",
            "last_updated": now.isoformat(),
            "releases": releases
        })
    except Exception as e:
        # Fallback to cache on network/parsing error
        if cache["data"] is not None:
            return jsonify({
                "success": True,
                "source": "cache_fallback",
                "last_updated": cache["last_updated"].isoformat(),
                "error": str(e),
                "releases": cache["data"]
            })
        return jsonify({
            "success": False,
            "error": f"Failed to fetch release notes: {str(e)}"
        }), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)
