const API_URLS = (
  import.meta.env.VITE_API_URLS ??
  import.meta.env.VITE_API_URL ??
  "http://localhost:3001"
)
  .split(",")
  .map((url: string) => url.trim())
  .filter(Boolean);

let currentApiUrlIndex = 0;

class ApiResponseError extends Error {}

export type User = {
  id: string;
  username: string;
  displayName?: string;
  display_name?: string;
  last_seen_at?: string | null;
  online?: boolean;
};

export type Conversation = {
  id: string;
  type: "direct" | "group";
  title: string | null;
  display_title: string | null;
  current_user_role: "owner" | "member";
  created_at: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  direct_user_id: string | null;
  direct_user_online: boolean | null;
  direct_user_last_seen_at: string | null;
};

export type GroupMember = User & {
  role: "owner" | "member";
  joined_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  username?: string;
  display_name?: string;
  body: string;
  created_at: string;
};

export type SystemStatus = {
  zookeeper: {
    connected: boolean;
    registered: boolean;
    nodeId: string | null;
    path: string | null;
    requestedNodeId: string | null;
    host: string;
    lastError: string | null;
  };
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let lastNetworkError: unknown = null;

  // Em desenvolvimento o frontend fala com um gateway local. Se ele cair ou
  // se a lista tiver varias URLs, a camada de API tenta a proxima automaticamente.
  for (let attempt = 0; attempt < API_URLS.length; attempt += 1) {
    const apiUrl = API_URLS[currentApiUrlIndex];

    try {
      const response = await fetch(`${apiUrl}${path}`, {
        ...options,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...options.headers
        }
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new ApiResponseError(payload.error ?? "REQUEST_FAILED");
      }

      if (response.status === 204) return undefined as T;
      return response.json();
    } catch (error) {
      if (error instanceof ApiResponseError) {
        throw error;
      }

      lastNetworkError = error;
      advanceApiUrl();
    }
  }

  throw lastNetworkError instanceof Error ? lastNetworkError : new Error("NETWORK_UNAVAILABLE");
}

export const api = {
  me: () => request<{ user: User }>("/auth/me"),
  login: (username: string, password: string) =>
    request<{ user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    }),
  register: (username: string, password: string, displayName: string) =>
    request<{ user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, displayName })
    }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  systemStatus: () => request<SystemStatus>("/system/status"),
  users: () => request<{ users: User[] }>("/users"),
  conversations: () => request<{ conversations: Conversation[] }>("/conversations"),
  directConversation: (userId: string) =>
    request<{ conversationId: string }>("/conversations/direct", {
      method: "POST",
      body: JSON.stringify({ userId })
    }),
  createGroup: (title: string, memberIds: string[]) =>
    request<{ conversationId: string }>("/conversations/groups", {
      method: "POST",
      body: JSON.stringify({ title, memberIds })
    }),
  messages: (conversationId: string) =>
    request<{ messages: Message[] }>(`/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: string, body: string) =>
    request<{ message: Message }>(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body })
    }),
  markRead: (conversationId: string) =>
    request<void>(`/conversations/${conversationId}/read`, {
      method: "POST"
    }),
  groupMembers: (conversationId: string) =>
    request<{ members: GroupMember[] }>(`/conversations/${conversationId}/members`),
  addGroupMember: (conversationId: string, userId: string) =>
    request<void>(`/conversations/${conversationId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId })
    }),
  removeGroupMember: (conversationId: string, userId: string) =>
    request<void>(`/conversations/${conversationId}/members/${userId}`, {
      method: "DELETE"
    }),
  deleteConversation: (conversationId: string) =>
    request<void>(`/conversations/${conversationId}`, {
      method: "DELETE"
    })
};

export function websocketUrl() {
  return currentApiUrl().replace(/^http/, "ws") + "/ws";
}

export function advanceApiUrl() {
  currentApiUrlIndex = (currentApiUrlIndex + 1) % API_URLS.length;
}

export function currentApiUrl() {
  return API_URLS[currentApiUrlIndex];
}
