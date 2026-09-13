function notFound(req, res, next) {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  res.status(status).json({ message: err.message || 'Internal Server Error' });
}

module.exports = { notFound, errorHandler };
