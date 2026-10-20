const authService = require('../services/auth.service');
const accountService = require('../services/account.service');
const { fail, validationFailure } = require('../errors');
const passwordResetService = require('../services/passwordReset.service');
const {
  validateSignup,
  validateLogin,
  validateDeleteAccount,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
} = require('../validations/auth.validation');
const { validateUpdateLocale } = require('../validations/user.validation');

async function signup(req, res, next) {
  try {
    const errors = validateSignup(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const result = await authService.signup(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const errors = validateLogin(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const session = await authService.getCurrentUser(req.userId);
    if (!session) throw fail('USER_NOT_FOUND', 404);
    res.json(session);
  } catch (err) {
    next(err);
  }
}

async function updateLocale(req, res, next) {
  try {
    const errors = validateUpdateLocale(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const user = await authService.updatePreferredLocale(req.userId, req.body.preferredLocale);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function deleteAccount(req, res, next) {
  try {
    const errors = validateDeleteAccount(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const result = await accountService.deleteAccount(req.userId, req.body.password);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Ask for a reset link. 204 whether or not the address has an account.
 *
 * The API's other public route, `GET /invites?email=`, is already an existence
 * oracle for invited addresses. This must not add a second: "does this person
 * bank here" is exactly what an attacker wants from a business app.
 */
async function forgotPassword(req, res, next) {
  try {
    const errors = validateForgotPassword(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    await passwordResetService.requestReset(req.body.email);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const errors = validateResetPassword(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    await passwordResetService.resetPassword(req.body);
    // No session: they sign in with the new password, which is also the quickest
    // proof to themselves that it took.
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const errors = validateChangePassword(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    // A fresh token, because the change has just invalidated the one that sent
    // this request along with every other device's.
    const result = await passwordResetService.changePassword(req.userId, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  forgotPassword,
  resetPassword,
  changePassword, signup, login, me, updateLocale, deleteAccount };
