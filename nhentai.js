
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


// GET CDN
async function getCDN() {
    const response = await fetch(`${API}/cdn`, { headers });

    if (!response.ok) {
        throw new Error("Could not load CDN configuration");
    }

    return await response.json();
}


// SEARCH + FILTERS
app.get("/nhentai/v2", async (req, res) => {
    try {
        const searched = req.query.searched || "";
        const page = req.query.page || 1;

        const response = await fetch(
            `${API}/search?query=${encodeURIComponent(searched)}&page=${page}`,
            { headers }
        );

        if (!response.ok) {
            throw new Error("Search failed");
        }

        const data = await response.json();
        const cdn = await getCDN();

        const galleries = data.result.map(item => ({
            id: item.id,

            title:
                item.english_title ||
                item.japanese_title ||
                "Untitled",

            japanese_title: item.japanese_title,

            photo: `${cdn.thumb_servers[0]}/${typeof item.thumbnail === "string"
                ? item.thumbnail
                : item.thumbnail?.path}`,

            pages: item.num_pages,

            language: item.tags?.find(
                tag => tag.type === "language"
            )?.name || "Unknown"
        }));

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


// RANDOM MANGA
app.get("/nhentai/random", async (req, res) => {
    try {
        const cdn = await getCDN();

        const requests = Array.from({ length: 8 }, () =>
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
                    throw new Error("Random response did not contain a gallery ID");
                }

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

                if (!thumbnail) {
                    throw new Error("Thumbnail missing");
                }

                return {
                    id: item.id,

                    title:
                        item.title?.english ||
                        item.title?.japanese ||
                        item.title?.pretty ||
                        item.english_title ||
                        item.japanese_title ||
                        "Untitled",

                    photo: `${cdn.thumb_servers[0]}/${thumbnail}`,

                    pages: item.num_pages,

                    language: item.tags?.find(
                        tag => tag.type === "language"
                    )?.name || "Unknown"
                };
            })
        );

        res.json({ result: galleries });

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

            pages: gallery.pages.map(page => ({
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
