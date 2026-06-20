export type AuthenticatedUser = {
  id: string;
  username: string;
  displayName: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionToken?: string;
    }
  }
}
