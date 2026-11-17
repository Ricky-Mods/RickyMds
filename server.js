require("dotenv").config();

const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const UPLOADS = path.join(ROOT, "uploads");


// CREATE REQUIRED FOLDERS

for (const dir of [
    DATA,
    path.join(UPLOADS, "apps"),
    path.join(UPLOADS, "covers")
]) {
    fs.mkdirSync(dir, { recursive: true });
}


// ENVIRONMENT SECURITY

if (!process.env.SESSION_SECRET ||
    !process.env.ADMIN_PASSWORD) {

    console.error(
        "Missing SESSION_SECRET or ADMIN_PASSWORD. Configure your .env file."
    );

    process.exit(1);
}


// DATABASE CONNECTION

const db = new Database(
    path.join(DATA, "ricky-mods.db")
);

db.pragma("journal_mode = WAL");


// DATABASE TABLES

db.exec(`

CREATE TABLE IF NOT EXISTS apps (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    title TEXT NOT NULL,

    slug TEXT NOT NULL UNIQUE,

    category TEXT NOT NULL,

    version TEXT DEFAULT '',

    size TEXT DEFAULT '',

    description TEXT NOT NULL,

    features TEXT DEFAULT '',

    package_name TEXT DEFAULT '',

    file_name TEXT NOT NULL,

    cover_name TEXT DEFAULT '',

    downloads INTEGER NOT NULL DEFAULT 0,

    featured INTEGER NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'published',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

);


CREATE TABLE IF NOT EXISTS settings (

    key TEXT PRIMARY KEY,

    value TEXT NOT NULL

);

`);


// INITIAL ADMIN PASSWORD

const adminHash = bcrypt.hashSync(
    process.env.ADMIN_PASSWORD,
    12
);

const setting = db.prepare(
    "SELECT value FROM settings WHERE key='admin_hash'"
).get();

if (!setting) {

    db.prepare(
        "INSERT INTO settings(key,value) VALUES('admin_hash',?)"
    ).run(adminHash);

}


// MIDDLEWARE

app.disable("x-powered-by");

app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

app.use(
    express.json({
        limit: "1mb"
    })
);

app.use(
    express.urlencoded({
        extended: true
    })
);


// SESSION MANAGEMENT

app.use(
    session({

        store: new SQLiteStore({
            db: "sessions.db",
            dir: DATA
        }),

        secret: process.env.SESSION_SECRET,

        resave: false,

        saveUninitialized: false,

        cookie: {

            httpOnly: true,

            sameSite: "lax",

            secure: process.env.NODE_ENV === "production",

            maxAge: 8 * 60 * 60 * 1000

        }

    })
);


// LOGIN RATE LIMIT

app.use(
    "/api/login",
    rateLimit({

        windowMs: 15 * 60 * 1000,

        limit: 10,

        standardHeaders: true,

        legacyHeaders: false

    })
);


// SERVE FRONTEND

app.use(
    express.static(
        path.join(ROOT, "public")
    )
);

app.get("/admin", (req, res) => {

    res.sendFile(
        path.join(ROOT, "public", "admin.html")
    );

});


// SERVE COVER IMAGES

app.use(
    "/uploads/covers",
    express.static(
        path.join(UPLOADS, "covers")
    )
);


// HELPER FUNCTIONS

const clean = (value, max = 10000) => {

    return String(value ?? "")
        .trim()
        .slice(0, max);

};


const slugify = (value) => {

    return clean(value, 100)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        || crypto.randomUUID();

};


// FORMAT DATABASE APP FOR PUBLIC WEBSITE

const publicApp = (row) => ({

    id: row.id,

    title: row.title,

    slug: row.slug,

    category: row.category,

    version: row.version,

    size: row.size,

    description: row.description,

    features: row.features,

    packageName: row.package_name,

    cover: row.cover_name
        ? `/uploads/covers/${encodeURIComponent(row.cover_name)}`
        : "",

    downloads: row.downloads,

    featured: !!row.featured,

    createdAt: row.created_at

});


// ADMIN AUTHENTICATION MIDDLEWARE

const isAdmin = (req, res, next) => {

    if (req.session?.admin) {

        return next();

    }

    return res.status(401).json({

        error: "Please sign in as an administrator."

    });

};


// FILE UPLOAD CONFIGURATION

const storage = multer.diskStorage({

    destination: (req, file, cb) => {

        if (file.fieldname === "apk") {

            cb(
                null,
                path.join(UPLOADS, "apps")
            );

        } else {

            cb(
                null,
                path.join(UPLOADS, "covers")
            );

        }

    },


    filename: (req, file, cb) => {

        const ext = path.extname(
            file.originalname
        ).toLowerCase();

        cb(
            null,
            `${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`
        );

    }

});


const upload = multer({

    storage,

    limits: {

        fileSize:
            Number(process.env.MAX_UPLOAD_MB || 500)
            * 1024 * 1024,

        files: 2

    },


    fileFilter: (req, file, cb) => {

        const ext = path.extname(
            file.originalname
        ).toLowerCase();


        const allowedApps = [
            ".apk",
            ".xapk",
            ".apks",
            ".zip"
        ];


        const allowedImages = [
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/avif"
        ];


        const valid = file.fieldname === "apk"
            ? allowedApps.includes(ext)
            : file.fieldname === "cover"
                && allowedImages.includes(file.mimetype);


        if (valid) {

            cb(null, true);

        } else {

            cb(
                new Error("Unsupported file type.")
            );

        }

    }

});


// ======================================
// PUBLIC WEBSITE API
// ======================================


// GET APPLICATIONS AND GAMES

app.get("/api/apps", (req, res) => {

    const q = clean(req.query.q, 100);

    const category = clean(
        req.query.category,
        60
    );

    const where = [
        "status='published'"
    ];

    const args = [];


    if (q) {

        where.push(
            "(title LIKE ? OR description LIKE ? OR category LIKE ?)"
        );

        args.push(
            `%${q}%`,
            `%${q}%`,
            `%${q}%`
        );

    }


    if (category && category !== "All") {

        where.push("category=?");

        args.push(category);

    }


    const rows = db.prepare(`

        SELECT * FROM apps

        WHERE ${where.join(" AND ")}

        ORDER BY featured DESC, created_at DESC

    `).all(...args);


    res.json(
        rows.map(publicApp)
    );

});


// GET SINGLE APP

app.get("/api/apps/:slug", (req, res) => {

    const row = db.prepare(`

        SELECT * FROM apps

        WHERE slug=?

        AND status='published'

    `).get(
        clean(req.params.slug, 120)
    );


    if (!row) {

        return res.status(404).json({

            error: "App not found."

        });

    }


    res.json(
        publicApp(row)
    );

});


// DOWNLOAD APPLICATION

app.get("/api/download/:id", (req, res) => {

    const row = db.prepare(`

        SELECT * FROM apps

        WHERE id=?

        AND status='published'

    `).get(
        Number(req.params.id)
    );


    if (!row) {

        return res.status(404).send(
            "Download not found."
        );

    }


    const file = path.join(
        UPLOADS,
        "apps",
        path.basename(row.file_name)
    );


    if (!fs.existsSync(file)) {

        return res.status(404).send(
            "The file is currently unavailable."
        );

    }


    db.prepare(`

        UPDATE apps

        SET downloads = downloads + 1

        WHERE id=?

    `).run(row.id);


    res.download(
        file,
        path.basename(row.file_name)
    );

});


// ======================================
// ADMIN LOGIN
// ======================================

app.post("/api/login", async (req, res) => {

    const username = clean(
        req.body.username,
        80
    );

    const password = String(
        req.body.password || ""
    );


    const expected = clean(
        process.env.ADMIN_USERNAME || "admin",
        80
    );


    const hash = db.prepare(`

        SELECT value FROM settings

        WHERE key='admin_hash'

    `).get()?.value;


    if (
        username !== expected ||
        !await bcrypt.compare(password, hash || "")
    ) {

        return res.status(401).json({

            error: "Incorrect username or password."

        });

    }


    req.session.regenerate(err => {

        if (err) {

            return res.status(500).json({

                error: "Could not create a secure session."

            });

        }


        req.session.admin = true;

        res.json({

            ok: true

        });

    });

});


// ADMIN LOGOUT

app.post("/api/logout", isAdmin, (req, res) => {

    req.session.destroy(() => {

        res.json({

            ok: true

        });

    });

});


// CHECK ADMIN SESSION

app.get("/api/admin/me", isAdmin, (req, res) => {

    res.json({

        ok: true

    });

});


// ======================================
// ADMIN APPLICATION MANAGEMENT
// ======================================


// GET ALL LISTINGS

app.get("/api/admin/apps", isAdmin, (req, res) => {

    const rows = db.prepare(`

        SELECT * FROM apps

        ORDER BY created_at DESC

    `).all();


    res.json(

        rows.map(row => ({

            ...publicApp(row),

            status: row.status,

            fileName: row.file_name,

            coverName: row.cover_name

        }))

    );

});


// UPLOAD NEW APPLICATION

app.post(
    "/api/admin/apps",
    isAdmin,
    upload.fields([
        { name: "apk", maxCount: 1 },
        { name: "cover", maxCount: 1 }
    ]),
    (req, res) => {

        const title = clean(
            req.body.title,
            120
        );

        const description = clean(
            req.body.description,
            12000
        );


        const apk = req.files?.apk?.[0];


        if (!title || !description || !apk) {

            if (apk) {

                fs.unlinkSync(apk.path);

            }

            return res.status(400).json({

                error: "Title, description and an app file are required."

            });

        }


        const slug =
            slugify(title)
            + "-"
            + crypto.randomBytes(2).toString("hex");


        const cover =
            req.files?.cover?.[0]?.filename || "";


        const info = {

            title,

            slug,

            category: clean(
                req.body.category,
                60
            ) || "Apps",

            version: clean(
                req.body.version,
                40
            ),

            size: clean(
                req.body.size,
                40
            ),

            description,

            features: clean(
                req.body.features,
                4000
            ),

            package_name: clean(
                req.body.packageName,
                160
            ),

            file_name: apk.filename,

            cover_name: cover,

            featured:
                req.body.featured === "true" ? 1 : 0,

            status:
                req.body.status === "draft"
                    ? "draft"
                    : "published"

        };


        const result = db.prepare(`

            INSERT INTO apps(

                title,
                slug,
                category,
                version,
                size,
                description,
                features,
                package_name,
                file_name,
                cover_name,
                featured,
                status

            )

            VALUES(

                @title,
                @slug,
                @category,
                @version,
                @size,
                @description,
                @features,
                @package_name,
                @file_name,
                @cover_name,
                @featured,
                @status

            )

        `).run(info);


        res.status(201).json({

            id: result.lastInsertRowid

        });

    }
);


// EDIT EXISTING APPLICATION

app.put(
    "/api/admin/apps/:id",
    isAdmin,
    upload.fields([
        { name: "apk", maxCount: 1 },
        { name: "cover", maxCount: 1 }
    ]),
    (req, res) => {

        const old = db.prepare(`

            SELECT * FROM apps

            WHERE id=?

        `).get(
            Number(req.params.id)
        );


        if (!old) {

            return res.status(404).json({

                error: "App not found."

            });

        }


        const apk = req.files?.apk?.[0];

        const cover = req.files?.cover?.[0];


        const data = {

            id: old.id,

            title: clean(
                req.body.title,
                120
            ) || old.title,

            category: clean(
                req.body.category,
                60
            ) || old.category,

            version: clean(
                req.body.version,
                40
            ),

            size: clean(
                req.body.size,
                40
            ),

            description: clean(
                req.body.description,
                12000
            ) || old.description,

            features: clean(
                req.body.features,
                4000
            ),

            package_name: clean(
                req.body.packageName,
                160
            ),

            file_name: apk?.filename || old.file_name,

            cover_name: cover?.filename || old.cover_name,

            featured:
                req.body.featured === "true" ? 1 : 0,

            status:
                req.body.status === "draft"
                    ? "draft"
                    : "published"

        };


        db.prepare(`

            UPDATE apps SET

                title=@title,
                category=@category,
                version=@version,
                size=@size,
                description=@description,
                features=@features,
                package_name=@package_name,
                file_name=@file_name,
                cover_name=@cover_name,
                featured=@featured,
                status=@status

            WHERE id=@id

        `).run(data);


        if (apk) {

            fs.unlink(
                path.join(UPLOADS, "apps", old.file_name),
                () => {}
            );

        }


        if (cover && old.cover_name) {

            fs.unlink(
                path.join(UPLOADS, "covers", old.cover_name),
                () => {}
            );

        }


        res.json({

            ok: true

        });

    }
);


// DELETE APPLICATION

app.delete(
    "/api/admin/apps/:id",
    isAdmin,
    (req, res) => {

        const row = db.prepare(`

            SELECT * FROM apps

            WHERE id=?

        `).get(
            Number(req.params.id)
        );


        if (!row) {

            return res.status(404).json({

                error: "App not found."

            });

        }


        db.prepare(`

            DELETE FROM apps

            WHERE id=?

        `).run(row.id);


        const files = [

            [
                path.join(UPLOADS, "apps"),
                row.file_name
            ],

            [
                path.join(UPLOADS, "covers"),
                row.cover_name
            ]

        ];


        for (const [dir, name] of files) {

            if (name) {

                fs.unlink(
                    path.join(dir, path.basename(name)),
                    () => {}
                );

            }

        }


        res.json({

            ok: true

        });

    }
);


// ======================================
// ADMIN STATISTICS
// ======================================

app.get(
    "/api/admin/stats",
    isAdmin,
    (req, res) => {

        const total = db.prepare(`

            SELECT COUNT(*) n

            FROM apps

        `).get().n;


        const published = db.prepare(`

            SELECT COUNT(*) n

            FROM apps

            WHERE status='published'

        `).get().n;


        const downloads = db.prepare(`

            SELECT COALESCE(SUM(downloads),0) n

            FROM apps

        `).get().n;


        res.json({

            total,

            published,

            downloads

        });

    }
);


// ======================================
// CHANGE ADMIN PASSWORD
// ======================================

app.post(
    "/api/admin/change-password",
    isAdmin,
    async (req, res) => {

        const current = String(
            req.body.currentPassword || ""
        );

        const next = String(
            req.body.newPassword || ""
        );


        const hash = db.prepare(`

            SELECT value FROM settings

            WHERE key='admin_hash'

        `).get()?.value;


        if (!await bcrypt.compare(current, hash || "")) {

            return res.status(400).json({

                error: "Current password is incorrect."

            });

        }


        if (next.length < 12) {

            return res.status(400).json({

                error: "Use at least 12 characters for the new password."

            });

        }


        db.prepare(`

            UPDATE settings

            SET value=?

            WHERE key='admin_hash'

        `).run(
            await bcrypt.hash(next, 12)
        );


        res.json({

            ok: true

        });

    }
);


// ======================================
// ERROR HANDLING
// ======================================

app.use((err, req, res, next) => {

    console.error(err.message);

    res.status(
        err instanceof multer.MulterError ? 400 : 500
    ).json({

        error: err.message || "Server error."

    });

});


// MAIN WEBSITE ROUTE

app.get("*", (req, res) => {

    res.sendFile(
        path.join(ROOT, "public", "index.html")
    );

});


// START SERVER

app.listen(PORT, () => {

    console.log(
        `RICKY MODs running at http://localhost:${PORT}`
    );

});