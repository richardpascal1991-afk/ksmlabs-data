require("dotenv").config();
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);

const { DATA_DIR } = require("./db");
const { bootstrapAdmin } = require("./bootstrap-admin");

bootstrapAdmin();

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const playerRoutes = require("./routes/player");
const mediaRoutes = require("./routes/media");
const collaborateurRoutes = require("./routes/collaborateur");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));
app.set("trust proxy", 1); // nécessaire derrière le proxy HTTPS de Railway/Render

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "frame-src": ["'self'", "https://www.youtube.com"],
        "img-src": ["'self'", "data:", "blob:"],
      },
    },
  })
);

app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.use(
  session({
    store: new SQLiteStore({ dir: DATA_DIR, db: "sessions.sqlite" }),
    name: "ksmlabs.sid",
    secret: process.env.SESSION_SECRET || "change-moi",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 1000 * 60 * 60 * 24 * 14, // 14 jours
    },
  })
);

// Rend le nom de l'agence disponible dans toutes les vues.
app.use((req, res, next) => {
  res.locals.agencyName = process.env.AGENCY_NAME || "KSMLABS";
  res.locals.isAdmin = !!(req.session && req.session.adminId);
  res.locals.isPlayer = !!(req.session && req.session.playerId);
  res.locals.isCollaborateur = !!(req.session && req.session.isCollaborateur);
  next();
});

app.get("/", (req, res) => {
  if (req.session.adminId) return res.redirect("/admin");
  if (req.session.playerId) return res.redirect("/joueur");
  if (req.session.isCollaborateur) return res.redirect("/collaborateur");
  res.render("accueil");
});

app.use("/", authRoutes);
app.use("/admin", adminRoutes);
app.use("/joueur", playerRoutes);
app.use("/collaborateur", collaborateurRoutes);
app.use("/media", mediaRoutes);

app.use((req, res) => {
  res.status(404).render("404");
});

// Gestionnaire d'erreurs générique — évite d'exposer une trace technique aux joueurs.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render("500");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`KSMLABS - serveur démarré sur le port ${PORT}`);
});
