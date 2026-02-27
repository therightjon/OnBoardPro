export function buildCspDirectives(isDevelopment: boolean) {
  return {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    scriptSrc: isDevelopment
      ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
      : ["'self'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: isDevelopment
      ? ["'self'", "ws:", "wss:", "https://fonts.googleapis.com", "https://fonts.gstatic.com"]
      : ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    ...(isDevelopment ? { upgradeInsecureRequests: null } : {})
  };
}
