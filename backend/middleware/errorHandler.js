const errorHandler = (err, req, res, next) => {
  // Full detail is logged server-side only.
  console.error('[error]', err.message, err.stack);
  const status = err.status || 500;
  const code   = err.code   || 'internal';
  // Never leak internal error detail to clients on server errors (5xx).
  // Client errors (4xx) carry safe, intentional messages set by controllers.
  const message = status >= 500
    ? 'An internal server error occurred.'
    : (err.message || 'Request could not be processed.');
  res.status(status).json({ code, message });
};

module.exports = errorHandler;
