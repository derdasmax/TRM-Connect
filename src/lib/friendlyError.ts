/** Maps a raw (often technical) error string to a short, plain-language
 *  message. The raw string is always kept alongside it so the user can
 *  still see the full detail on demand - this never discards information,
 *  it just leads with something a non-technical user can act on. */
export function friendlyMessage(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("authentication failed") || s.includes("rejected the supplied credentials")) {
    return "Login failed. Check the username and password (or key) and try again.";
  }
  if (s.includes("host key verification failed") || s.includes("man-in-the-middle")) {
    return "The server's identity could not be verified. This could mean the server changed, or something is intercepting the connection.";
  }
  if (s.includes("connection timed out") || s.includes("timed out")) {
    return "The connection timed out. The server may be unreachable, or a firewall may be blocking it.";
  }
  if (s.includes("connection refused")) {
    return "The server refused the connection. Check the host and port.";
  }
  if (s.includes("no route to host") || s.includes("network is unreachable")) {
    return "The server could not be reached. Check your network connection and the server address.";
  }
  if (s.includes("no such file or directory") || s.includes("not found")) {
    return "The file or folder no longer exists at that location.";
  }
  if (s.includes("permission denied")) {
    return "Permission denied. You may not have access to this file or folder.";
  }
  if (s.includes("already exists")) {
    return "A file or folder with that name already exists.";
  }
  if (s.includes("disk") && (s.includes("full") || s.includes("space"))) {
    return "There isn't enough disk space to complete this.";
  }
  if (s.includes("not supported by this protocol")) {
    return "This action isn't supported by the current protocol.";
  }
  if (s.includes("too large to preview")) {
    return raw; // already plain language
  }
  return "Something went wrong.";
}
