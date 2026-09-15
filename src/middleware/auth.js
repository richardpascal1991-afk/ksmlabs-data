const rateLimit = require("express-rate-limit");

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.redirect("/admin/login");
}

function requirePlayer(req, res, next) {
  if (req.session && req.session.playerId) return next();
  return res.redirect("/joueur/login");
}

function requireCollaborateur(req, res, next) {
  if (req.session && req.session.isCollaborateur) return next();
  return res.redirect("/collaborateur/login");
}

// Limite les tentatives de connexion pour freiner le bruteforce sur les
// codes joueurs / mot de passe admin.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Trop de tentatives de connexion. Réessaie dans quelques minutes.",
});

module.exports = { requireAdmin, requirePlayer, requireCollaborateur, loginLimiter };
