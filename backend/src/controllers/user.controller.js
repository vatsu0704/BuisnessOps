const userService = require('../services/user.service');
const { fail } = require('../errors');

async function listUsers(req, res, next) {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
}

async function getUser(req, res, next) {
  try {
    const user = await userService.getUserById(req.params.id);
    if (!user) {
      throw fail('USER_NOT_FOUND', 404);
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, getUser };
