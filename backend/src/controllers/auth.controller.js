const authService = require('../services/auth.service');
const { validateSignup, validateLogin } = require('../validations/auth.validation');
const { validateUpdateLocale } = require('../validations/user.validation');

async function signup(req, res, next) {
  try {
    const errors = validateSignup(req.body);
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    const result = await authService.signup(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const errors = validateLogin(req.body);
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const session = await authService.getCurrentUser(req.userId);
    if (!session) return res.status(404).json({ message: 'User not found' });
    res.json(session);
  } catch (err) {
    next(err);
  }
}

async function updateLocale(req, res, next) {
  try {
    const errors = validateUpdateLocale(req.body);
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    const user = await authService.updatePreferredLocale(req.userId, req.body.preferredLocale);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

module.exports = { signup, login, me, updateLocale };
