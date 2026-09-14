function notFound(req, res, next) {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
}

// Prisma errors are caught here rather than per-service so every model's
// unique/foreign-key constraints get a clean response without needing
// hand-written pre-checks everywhere — the alternative (letting them fall
// through to the generic 500 below) leaks internal file paths and raw
// query internals straight into the API response.
function errorHandler(err, req, res, next) {
  if (err.code === 'P2002') {
    const fields = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : err.meta?.target;
    return res.status(409).json({ message: `A record with this ${fields || 'value'} already exists` });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ message: 'Record not found' });
  }
  if (err.code === 'P2003') {
    return res.status(400).json({ message: 'Referenced record does not exist' });
  }

  const status = err.status || 500;
  res.status(status).json({ message: err.message || 'Internal Server Error' });
}

module.exports = { notFound, errorHandler };
