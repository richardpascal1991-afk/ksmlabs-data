const express = require("express");
const bcrypt = require("bcryptjs");
const { db } = require("../db");
const { loginLimiter } = require("../middleware/auth");

const router = express.Router();

// ---------- Connexion ADMIN ----------

router.get("/admin/login", (req, res) => {
  if (req.session.adminId) return res.redirect("/admin");
  res.render("admin/login", { error: null });
});

router.post("/admin/login", loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const admin = db
    .prepare("SELECT * FROM admins WHERE username = ?")
    .get((username || "").trim().toLowerCase());

  if (!admin || !bcrypt.compareSync(password || "", admin.password_hash)) {
    return res.status(401).render("admin/login", {
      error: "Identifiant ou mot de passe incorrect.",
    });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).render("500");
    req.session.adminId = admin.id;
    req.session.adminUsername = admin.username;
    res.redirect("/admin");
  });
});

// ---------- Connexion JOUEUR ----------

router.get("/joueur/login", (req, res) => {
  if (req.session.playerId) return res.redirect("/joueur");
  res.render("joueur/login", { error: null });
});

router.post("/joueur/login", loginLimiter, (req, res) => {
  const { identifiant, code } = req.body;
  const player = db
    .prepare("SELECT * FROM players WHERE identifiant = ? AND actif = 1")
    .get((identifiant || "").trim().toLowerCase());

  if (!player || !bcrypt.compareSync(code || "", player.code_hash)) {
    return res.status(401).render("joueur/login", {
      error: "Identifiant ou code incorrect.",
    });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).render("500");
    req.session.playerId = player.id;
    res.redirect("/joueur");
  });
});

// ---------- Connexion COLLABORATEUR (lecture seule, identifiant partagé) ----------

router.get("/collaborateur/login", (req, res) => {
  if (req.session.isCollaborateur) return res.redirect("/collaborateur/joueurs");
  res.render("collaborateur/login", { error: null });
});

router.post("/collaborateur/login", loginLimiter, (req, res) => {
  const { identifiant, code } = req.body;
  const acces = db.prepare("SELECT * FROM collaborateur_acces WHERE id = 1").get();

  const identifiantOk =
    acces && (identifiant || "").trim().toLowerCase() === acces.identifiant.toLowerCase();
  if (!acces || !identifiantOk || !bcrypt.compareSync(code || "", acces.code_hash)) {
    return res.status(401).render("collaborateur/login", {
      error: "Identifiant ou code incorrect.",
    });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).render("500");
    req.session.isCollaborateur = true;
    res.redirect("/collaborateur/joueurs");
  });
});

// ---------- Déconnexion (commune) ----------

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("ksmlabs.sid");
    res.redirect("/");
  });
});

module.exports = router;
