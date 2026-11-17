const fs = require("fs");
const https = require("https");

const API = "https://api.github.com";

function getConfig() {
    const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_RELEASE_TAG } = process.env;

    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO || !GITHUB_RELEASE_TAG) {
        throw new Error("GitHub storage is not fully configured.");
    }

    return {
        token: GITHUB_TOKEN,
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        tag: GITHUB_RELEASE_TAG
    };
}

async function apiRequest(endpoint, options = {}) {
    const config = getConfig();

    const response = await fetch(`${API}${endpoint}`, {
        ...options,
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${config.token}`,
            "X-GitHub-Api-Version": "2022-11-28",
            ...options.headers
        }
    });

    const body = await response.text();

    if (!response.ok) {
        throw new Error(`GitHub API error (${response.status}): ${body.slice(0, 300)}`);
    }

    return body ? JSON.parse(body) : null;
}

async function getRelease() {
    const config = getConfig();

    return apiRequest(
        `/repos/${config.owner}/${config.repo}/releases/tags/${encodeURIComponent(config.tag)}`
    );
}

async function uploadAsset(filePath, filename) {
    const config = getConfig();
    const release = await getRelease();
    const uploadUrl = release.upload_url.replace(/\{\?.*$/, "");
    const fileSize = fs.statSync(filePath).size;

    const url = new URL(uploadUrl);
    url.searchParams.set("name", filename);

    return new Promise((resolve, reject) => {
        const request = https.request(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${config.token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/octet-stream",
                "Content-Length": fileSize
            }
        }, response => {
            let data = "";

            response.setEncoding("utf8");
            response.on("data", chunk => data += chunk);

            response.on("end", () => {
                let result;

                try {
                    result = data ? JSON.parse(data) : {};
                } catch {
                    return reject(new Error("GitHub returned an invalid upload response."));
                }

                if (response.statusCode < 200 || response.statusCode >= 300) {
                    return reject(new Error(
                        `GitHub asset upload failed (${response.statusCode}).`
                    ));
                }

                resolve(result);
            });
        });

        request.on("error", reject);

        const stream = fs.createReadStream(filePath);
        stream.on("error", error => {
            request.destroy();
            reject(error);
        });

        stream.pipe(request);
    });
}

async function deleteAsset(assetId) {
    if (!assetId) return;

    const config = getConfig();

    return apiRequest(
        `/repos/${config.owner}/${config.repo}/releases/assets/${assetId}`,
        { method: "DELETE" }
    );
}

module.exports = {
    getRelease,
    uploadAsset,
    deleteAsset
};
