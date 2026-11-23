
require("dotenv").config();

const express = require("express");
const app = express();

app.use(express.json());
app.use(express.static("public"));

const API = "https://nhentai.net/api/v2";

const headers = {
    Authorization: `Key ${process.env.HOT_API}`,
    "User-Agent": "Curiosity/1.0 (Local Project)"
};

// Cache random homepage batches
const randomPages = new Map();


// GET CDN
async function getCDN() {
    const response = await fetch(`${API}/cdn`, { headers });

    if (!response.ok) {
        throw new Error("Could not load CDN configuration");
    }

    return await response.json();
}


// LANGUAGE
function getLanguage(tags) {
    if (!Array.isArray(tags)) return "Unknown";

    return tags.find(tag => tag.type === "language")?.name || "Unknown";
}


// SEARCH + FILTERS
app.get("/nhentai/v2", async (req, res) => {
    try {
        const searched = req.query.searched || "";
        const page = Math.max(1, Number(req.query.page) || 1);

        const response = await fetch(
            `${API}/search?query=${encodeURIComponent(searched)}&page=${page}`,
            { headers }
        );

        if (!response.ok) {
            throw new Error("Search failed");
        }

        const data = await response.json();
        const cdn = await getCDN();

        const galleries = await Promise.all(
            (data.result || []).map(async item => {

                let tags = item.tags || [];

                // Fetch details if language is missing
                if (!tags.some(tag => tag.type === "language")) {
                    try {
                        const detailsResponse = await fetch(
                            `${API}/galleries/${item.id}`,
                            { headers }
                        );

                        if (detailsResponse.ok) {
                            const details = await detailsResponse.json();
                            const gallery = details.gallery || details;

                            tags = gallery.tags || tags;
                        }
                    } catch (error) {
                        console.error("LANGUAGE ERROR:", error.message);
                    }
                }

                const thumbnail =
                    typeof item.thumbnail === "string"
                        ? item.thumbnail
                        : item.thumbnail?.path || item.cover?.path;

                return {
                    id: item.id,

                    title:
                        item.title?.english ||
                        item.english_title ||
                        item.title?.japanese ||
                        item.japanese_title ||
                        item.title?.pretty ||
                        "Untitled",

                    photo: thumbnail
                        ? `${cdn.thumb_servers[0]}/${thumbnail}`
                        : null,

                    pages: item.num_pages,

                    language: getLanguage(tags)
                };
            })
        );

        res.json({
            result: galleries,
            total: data.total,
            num_pages: data.num_pages,
            per_page: data.per_page
        });

    } catch (error) {
        console.error("SEARCH ERROR:", error);

        res.status(500).json({
            error: error.message
        });
    }
});


// RANDOM HOMEPAGE
app.get("/nhentai/random", async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);

        // Return previously loaded random batch
        if (randomPages.has(page)) {
            return res.json(randomPages.get(page));
        }

        const cdn = await getCDN();

        // Generate 24 random galleries
        const requests = Array.from({ length: 24 }, () =>
            fetch(`${API}/galleries/random`, { headers })
        );

        const responses = await Promise.all(requests);

        const galleries = await Promise.all(
            responses.map(async response => {

                if (!response.ok) {
                    throw new Error("Could not load random manga");
                }

                let item = await response.json();
                item = item.gallery || item;

                if (!item.id) {
                    throw new Error("Random gallery ID missing");
                }

                // Load full gallery if thumbnail or tags are missing
                if (!item.thumbnail && !item.cover?.path) {
                    const detailsResponse = await fetch(
                        `${API}/galleries/${item.id}`,
                        { headers }
                    );

                    if (!detailsResponse.ok) {
                        throw new Error("Could not load gallery details");
                    }

                    const details = await detailsResponse.json();
                    item = details.gallery || details;
                }

                const thumbnail =
                    typeof item.thumbnail === "string"
                        ? item.thumbnail
                        : item.thumbnail?.path || item.cover?.path;

                return {
                    id: item.id,

                    title:
                        item.title?.english ||
                        item.title?.japanese ||
                        item.title?.pretty ||
                        item.english_title ||
                        item.japanese_title ||
                        "Untitled",

                    photo: thumbnail
                        ? `${cdn.thumb_servers[0]}/${thumbnail}`
                        : null,

                    pages: item.num_pages,

                    language: getLanguage(item.tags)
                };
            })
        );

        const result = { result: galleries };

        // Save batch so Previous can return to it
        randomPages.set(page, result);

        res.json(result);

    } catch (error) {
        console.error("RANDOM ERROR:", error);

        res.status(500).json({
            error: error.message
        });
    }
});


// READ MANGA
app.get("/nhentai/read/:id", async (req, res) => {
    try {
        const response = await fetch(
            `${API}/galleries/${req.params.id}`,
            { headers }
        );

        if (!response.ok) {
            throw new Error("Could not load manga");
        }

        const data = await response.json();
        const gallery = data.gallery || data;
        const cdn = await getCDN();

        res.json({
            id: gallery.id,

            title:
                gallery.title?.english ||
                gallery.title?.japanese ||
                gallery.title?.pretty ||
                "Untitled",

            totalPages: gallery.num_pages,

            pages: (gallery.pages || []).map(page => ({
                number: page.number,
                image: `${cdn.image_servers[0]}/${page.path}`,
                width: page.width,
                height: page.height
            }))
        });

    } catch (error) {
        console.error("READER ERROR:", error);

        res.status(500).json({
            error: error.message
        });
    }
});


app.listen(3000, () => {
    console.log("Curiosity running on http://localhost:3000");
});
