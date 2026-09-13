const prisma = require('../config/db');

function getAllUsers() {
  return prisma.user.findMany({ select: { id: true, email: true, name: true, createdAt: true } });
}

function getUserById(id) {
  return prisma.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, createdAt: true } });
}

module.exports = { getAllUsers, getUserById };
