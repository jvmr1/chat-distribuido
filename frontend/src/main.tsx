import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { Eye, EyeOff, LogOut, MessageSquarePlus, Send, Trash2, UserMinus, UserPlus, UsersRound, X } from "lucide-react";
import { advanceApiUrl, api, Conversation, GroupMember, Message, SystemStatus, User, websocketUrl } from "./api";
import "./styles.css";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeDraftTitle, setActiveDraftTitle] = useState<string | null>(null);
  const [activeDraftType, setActiveDraftType] = useState<Conversation["type"] | null>(null);
  const [activeDraftRole, setActiveDraftRole] = useState<Conversation["current_user_role"] | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [groupMembersOpen, setGroupMembersOpen] = useState(false);
  const [directUserSearch, setDirectUserSearch] = useState("");
  const [groupUserSearch, setGroupUserSearch] = useState("");
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [loginError, setLoginError] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirmation, setShowRegisterConfirmation] = useState(false);
  const [loading, setLoading] = useState(true);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const scrollToBottomAfterLoadRef = useRef(false);

  useEffect(() => {
    // Restaura a sessao pelo cookie HTTP-only quando a pagina e recarregada.
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshConversations();
    api.users().then(({ users }) => setUsers(users)).catch(console.error);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const loadStatus = () => {
      api.systemStatus().then(setSystemStatus).catch(() => setSystemStatus(null));
    };

    loadStatus();
    const timer = window.setInterval(loadStatus, 5000);
    return () => window.clearInterval(timer);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    let closedByEffect = false;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;

    const connect = () => {
      // O WebSocket usa a mesma URL ativa da API. Se o backend cair,
      // advanceApiUrl tenta o proximo alvo/gateway no reconnect.
      socket = new WebSocket(websocketUrl());

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === "message.created") {
          const message = payload.message as Message;
          if (message.conversation_id === activeConversationId) {
            setMessages((current) => [...current, message]);
            if (message.sender_id !== user.id) {
              api.markRead(activeConversationId).then(refreshConversations).catch(console.error);
            } else {
              refreshConversations();
            }
          } else {
            refreshConversations();
          }
        }
        if (payload.type === "presence.changed") {
          setUsers((current) =>
            current.map((item) =>
              item.id === payload.userId
                ? { ...item, online: payload.online, last_seen_at: payload.lastSeenAt ?? item.last_seen_at }
                : item
            )
          );
          refreshConversations();
        }
        if (payload.type === "group.members.changed") {
          refreshConversations();
          if (payload.conversationId === activeConversationId && groupMembersOpen) {
            api.groupMembers(payload.conversationId).then(({ members }) => setGroupMembers(members)).catch(console.error);
          }
        }
        if (payload.type === "conversation.deleted") {
          refreshConversations();
          if (payload.conversationId === activeConversationId) {
            setActiveConversationId(null);
            setActiveDraftTitle(null);
            setActiveDraftType(null);
            setActiveDraftRole(null);
            setGroupMembersOpen(false);
            setMessages([]);
          }
        }
      };

      socket.onclose = () => {
        if (closedByEffect) return;
        advanceApiUrl();
        reconnectTimer = window.setTimeout(connect, 1000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      closedByEffect = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [user, activeConversationId, groupMembersOpen]);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    // Ao abrir qualquer conversa, carrega o historico e marca como lida no backend.
    api
      .messages(activeConversationId)
      .then(({ messages }) => {
        setMessages(messages);
        if (scrollToBottomAfterLoadRef.current) {
          scrollToBottomAfterLoadRef.current = false;
          scrollMessagesToBottom("auto");
        }
        refreshConversations();
      })
      .catch(console.error);
  }, [activeConversationId]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !activeConversationId) return;

    // Se a conversa esta aberta, qualquer nova mensagem deve ficar visivel,
    // seja enviada pelo usuario atual ou recebida de outra pessoa.
    scrollMessagesToBottom("smooth");
  }, [messages, activeConversationId]);

  function scrollMessagesToBottom(behavior: ScrollBehavior = "smooth") {
    const scroll = () => {
      messageListRef.current?.scrollTo({
        top: messageListRef.current.scrollHeight,
        behavior
      });
    };

    // Dois frames + timeout deixam a rolagem confiavel mesmo quando o Firefox
    // ainda esta recalculando a altura da lista de mensagens.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scroll);
    });
    window.setTimeout(scroll, 80);
  }

  function refreshConversations() {
    api.conversations().then(({ conversations }) => setConversations(conversations)).catch(console.error);
  }

  function conversationPresenceText(conversation: Conversation) {
    if (conversation.type !== "direct") return null;
    if (conversation.direct_user_online) return "Online";
    if (conversation.direct_user_last_seen_at) {
      return `Visto por ultimo ${formatLastSeen(conversation.direct_user_last_seen_at)}`;
    }

    return "Offline";
  }

  function formatLastSeen(value: string) {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoginError("");

    try {
      const { user } = await api.login(String(form.get("username")), String(form.get("password")));
      setUser(user);
    } catch {
      setLoginError("Usuario ou senha invalidos.");
    }
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username"));
    const displayName = String(form.get("displayName"));
    const password = String(form.get("password"));
    const passwordConfirmation = String(form.get("passwordConfirmation"));
    setLoginError("");

    if (password !== passwordConfirmation) {
      setLoginError("As senhas nao conferem.");
      return;
    }

    try {
      const { user } = await api.register(username, password, displayName);
      setUser(user);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "USERNAME_TAKEN") {
        setLoginError("Esse nome de usuario ja esta em uso.");
        return;
      }
      if (message === "INVALID_USERNAME") {
        setLoginError("Use 3 a 24 caracteres: letras, numeros, ponto, traco ou underline.");
        return;
      }
      setLoginError("Nao foi possivel criar a conta.");
    }
  }

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setUsers([]);
    setConversations([]);
    setActiveConversationId(null);
    setActiveDraftTitle(null);
    setActiveDraftType(null);
    setActiveDraftRole(null);
    setMessages([]);
    setMessageBody("");
    setNewConversationOpen(false);
    setNewGroupOpen(false);
    setGroupMembersOpen(false);
    setDirectUserSearch("");
    setGroupUserSearch("");
    setAddMemberSearch("");
    setSelectedGroupMembers([]);
    setGroupMembers([]);
    setSystemStatus(null);
  }

  async function startDirectConversation(userId: string) {
    const selectedUser = users.find((item) => item.id === userId);
    const { conversationId } = await api.directConversation(userId);
    await refreshConversations();
    setActiveConversationId(conversationId);
    setActiveDraftTitle(selectedUser ? displayUserName(selectedUser) : "Conversa direta");
    setActiveDraftType("direct");
    setActiveDraftRole("member");
    setNewConversationOpen(false);
    setDirectUserSearch("");
  }

  async function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title"));
    const { conversationId } = await api.createGroup(title, selectedGroupMembers);
    await refreshConversations();
    setActiveConversationId(conversationId);
    setActiveDraftTitle(title);
    setActiveDraftType("group");
    setActiveDraftRole("owner");
    setSelectedGroupMembers([]);
    setNewGroupOpen(false);
    setGroupUserSearch("");
    event.currentTarget.reset();
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeConversationId) return;
    const body = messageBody;
    if (!body.trim()) return;

    setMessageBody("");
    await api.sendMessage(activeConversationId, body);
    refreshConversations();
  }

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId),
    [conversations, activeConversationId]
  );
  const activeConversationType = activeConversation?.type ?? activeDraftType;
  const activeUserRole = activeConversation?.current_user_role ?? activeDraftRole;
  const isActiveGroup = activeConversationType === "group";
  const isActiveGroupOwner = isActiveGroup && activeUserRole === "owner";

  function toggleGroupMember(userId: string) {
    setSelectedGroupMembers((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
  }

  const directUsers = useMemo(
    () => filterUsers(users, directUserSearch),
    [users, directUserSearch]
  );

  const groupUsers = useMemo(
    () => filterUsers(users, groupUserSearch),
    [users, groupUserSearch]
  );

  const usersOutsideGroup = useMemo(() => {
    const memberIds = new Set(groupMembers.map((member) => member.id));
    return filterUsers(users, addMemberSearch).filter((item) => !memberIds.has(item.id));
  }, [users, groupMembers, addMemberSearch]);

  async function openGroupMembers() {
    if (!activeConversationId) return;
    const { members } = await api.groupMembers(activeConversationId);
    setGroupMembers(members);
    setGroupMembersOpen(true);
  }

  async function addMemberToActiveGroup(userId: string) {
    if (!activeConversationId) return;
    await api.addGroupMember(activeConversationId, userId);
    const { members } = await api.groupMembers(activeConversationId);
    setGroupMembers(members);
    setAddMemberSearch("");
  }

  async function removeMemberFromActiveGroup(userId: string) {
    if (!activeConversationId) return;
    await api.removeGroupMember(activeConversationId, userId);
    const { members } = await api.groupMembers(activeConversationId);
    setGroupMembers(members);
  }

  async function deleteActiveGroup() {
    if (!activeConversationId) return;
    await api.deleteConversation(activeConversationId);
    setGroupMembersOpen(false);
    setActiveConversationId(null);
    setActiveDraftTitle(null);
    setActiveDraftType(null);
    setActiveDraftRole(null);
    setMessages([]);
    refreshConversations();
  }

  if (loading) return <main className="loading">Carregando</main>;

  if (!user) {
    return (
      <main className="login-shell">
        <form key={authMode} className="login-panel" onSubmit={authMode === "login" ? handleLogin : handleRegister}>
          <h1>Chat Distribuido</h1>
          <div className="auth-tabs">
            <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => {
              setAuthMode("login");
              setLoginError("");
            }}>
              Entrar
            </button>
            <button type="button" className={authMode === "register" ? "active" : ""} onClick={() => {
              setAuthMode("register");
              setLoginError("");
            }}>
              Criar conta
            </button>
          </div>
          {authMode === "register" && (
            <label>
              Nome
              <input name="displayName" autoComplete="name" required />
            </label>
          )}
          <label>
            Usuario
            <input name="username" autoComplete="username" required />
          </label>
          <PasswordField
            label="Senha"
            name="password"
            autoComplete={authMode === "login" ? "current-password" : "new-password"}
            visible={authMode === "login" ? showLoginPassword : showRegisterPassword}
            onToggle={() =>
              authMode === "login"
                ? setShowLoginPassword((current) => !current)
                : setShowRegisterPassword((current) => !current)
            }
          />
          {authMode === "register" && (
            <PasswordField
              label="Confirmar senha"
              name="passwordConfirmation"
              autoComplete="new-password"
              visible={showRegisterConfirmation}
              onToggle={() => setShowRegisterConfirmation((current) => !current)}
            />
          )}
          {loginError && <p className="error">{loginError}</p>}
          <button type="submit">{authMode === "login" ? "Entrar" : "Criar conta"}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="profile">
          <div>
            <strong>{user.displayName ?? user.display_name ?? user.username}</strong>
            <span>@{user.username}</span>
          </div>
          <button className="icon-button" title="Sair" onClick={handleLogout}>
            <LogOut size={18} />
          </button>
        </div>

        <div className={systemStatus?.zookeeper.registered ? "system-status online" : "system-status"}>
          <span />
          ZooKeeper {systemStatus?.zookeeper.registered ? `conectado${systemStatus.zookeeper.aclEnabled ? " + ACL" : ""}` : "indisponivel"}
        </div>

        <section className="sidebar-section">
          <header>
            <h2>Conversas</h2>
            <div className="header-actions">
              <button className="icon-button compact" title="Nova conversa" onClick={() => setNewConversationOpen(true)}>
                <MessageSquarePlus size={16} />
              </button>
              <button className="icon-button compact" title="Novo grupo" onClick={() => setNewGroupOpen(true)}>
                <UsersRound size={16} />
              </button>
            </div>
          </header>
          <div className="conversation-list">
            {conversations.map((conversation) => {
              const presenceText = conversationPresenceText(conversation);

              return (
                <button
                  key={conversation.id}
                  className={[
                    "conversation",
                    conversation.id === activeConversationId ? "active" : "",
                    conversation.unread_count > 0 ? "unread" : ""
                  ].filter(Boolean).join(" ")}
                  onClick={() => {
                    scrollToBottomAfterLoadRef.current = true;
                    setActiveConversationId(conversation.id);
                    setActiveDraftTitle(null);
                    setActiveDraftType(null);
                    setActiveDraftRole(null);
                  }}
                >
                  <span className="conversation-title-row">
                    <strong>{conversation.display_title ?? conversation.title ?? "Conversa"}</strong>
                    {conversation.unread_count > 0 && <span className="unread-badge">{conversation.unread_count}</span>}
                  </span>
                  {presenceText && (
                    <small className={conversation.direct_user_online ? "presence online" : "presence"}>
                      {presenceText}
                    </small>
                  )}
                  <small className={conversation.unread_count > 0 ? "unread-preview" : ""}>
                    {conversation.last_message ?? "Sem mensagens"}
                  </small>
                </button>
              );
            })}
          </div>
        </section>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <h2>{activeConversation?.display_title ?? activeConversation?.title ?? activeDraftTitle ?? "Selecione uma conversa"}</h2>
          <div className="chat-header-actions">
            {isActiveGroup && (
              <button className="icon-button compact" title="Membros do grupo" onClick={openGroupMembers}>
                <UsersRound size={16} />
              </button>
            )}
            {activeConversationId && <span>{isActiveGroup ? "Grupo" : "Direta"}</span>}
          </div>
        </header>

        <div className="message-list" ref={messageListRef}>
          {messages.map((message) => (
            <article key={message.id} className={message.sender_id === user.id ? "message mine" : "message"}>
              <strong>{message.display_name ?? message.username ?? "Usuario"}</strong>
              <p>{message.body}</p>
            </article>
          ))}
        </div>

        <form className="composer" onSubmit={sendMessage}>
          <input
            name="body"
            placeholder="Escreva uma mensagem"
            disabled={!activeConversationId}
            value={messageBody}
            onChange={(event) => setMessageBody(event.target.value)}
          />
          <button className="icon-button primary" title="Enviar" disabled={!activeConversationId}>
            <Send size={18} />
          </button>
        </form>
      </section>

      {newConversationOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setNewConversationOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h2>Nova conversa</h2>
              <button className="icon-button compact" title="Fechar" onClick={() => setNewConversationOpen(false)}>
                <X size={16} />
              </button>
            </header>

            <div className="modal-section">
              <input
                value={directUserSearch}
                onChange={(event) => setDirectUserSearch(event.target.value)}
                placeholder="Buscar usuario"
                autoFocus
              />
              <div className="user-list modal-list">
                {directUsers.map((item) => (
                  <button key={item.id} type="button" onClick={() => startDirectConversation(item.id)}>
                    <span>{item.displayName ?? item.display_name ?? item.username}</span>
                    <small className={item.online ? "presence online" : "presence"}>
                      {item.online ? "Online" : "Offline"}
                    </small>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {newGroupOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setNewGroupOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h2>Novo grupo</h2>
              <button className="icon-button compact" title="Fechar" onClick={() => setNewGroupOpen(false)}>
                <X size={16} />
              </button>
            </header>

            <form className="modal-section group-create-form" onSubmit={createGroup}>
              <input name="title" placeholder="Nome do grupo" required />
              <input
                value={groupUserSearch}
                onChange={(event) => setGroupUserSearch(event.target.value)}
                placeholder="Buscar participantes"
                autoFocus
              />
              <div className="member-checklist">
                {groupUsers.map((item) => (
                  <label key={item.id} className="member-option">
                    <input
                      type="checkbox"
                      checked={selectedGroupMembers.includes(item.id)}
                      onChange={() => toggleGroupMember(item.id)}
                    />
                    <span>{item.displayName ?? item.display_name ?? item.username}</span>
                    <small className={item.online ? "presence online" : "presence"}>
                      {item.online ? "Online" : "Offline"}
                    </small>
                  </label>
                ))}
              </div>
              <button className="primary-text-button" type="submit">
                <UsersRound size={16} />
                Criar grupo
              </button>
            </form>
          </section>
        </div>
      )}

      {groupMembersOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setGroupMembersOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h2>Membros do grupo</h2>
              <button className="icon-button compact" title="Fechar" onClick={() => setGroupMembersOpen(false)}>
                <X size={16} />
              </button>
            </header>

            <div className="modal-section">
              <div className="member-checklist">
                {groupMembers.map((member) => (
                  <div key={member.id} className="member-option">
                    <span>{displayUserName(member)}</span>
                    <small className={member.online ? "presence online" : "presence"}>
                      {member.role === "owner" ? "Admin" : member.online ? "Online" : "Offline"}
                    </small>
                    {isActiveGroupOwner && member.role !== "owner" && (
                      <button
                        className="icon-button compact danger"
                        title="Remover do grupo"
                        onClick={() => removeMemberFromActiveGroup(member.id)}
                      >
                        <UserMinus size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {isActiveGroupOwner && (
              <div className="modal-section group-admin-actions">
                <input
                  value={addMemberSearch}
                  onChange={(event) => setAddMemberSearch(event.target.value)}
                  placeholder="Buscar usuario para adicionar"
                />
                <div className="user-list modal-list">
                  {usersOutsideGroup.map((item) => (
                    <button key={item.id} type="button" onClick={() => addMemberToActiveGroup(item.id)}>
                      <span>{displayUserName(item)}</span>
                      <small className={item.online ? "presence online" : "presence"}>
                        {item.online ? "Online" : "Offline"}
                      </small>
                      <UserPlus size={16} />
                    </button>
                  ))}
                </div>
                <button className="danger-text-button" type="button" onClick={deleteActiveGroup}>
                  <Trash2 size={16} />
                  Apagar grupo
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function filterUsers(users: User[], search: string) {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return users;

  return users.filter((user) => {
    const name = user.displayName ?? user.display_name ?? user.username;
    return `${name} ${user.username}`.toLowerCase().includes(normalizedSearch);
  });
}

function displayUserName(user: User) {
  return user.displayName ?? user.display_name ?? user.username;
}

type PasswordFieldProps = {
  label: string;
  name: string;
  autoComplete: string;
  defaultValue?: string;
  visible: boolean;
  onToggle: () => void;
};

function PasswordField({ label, name, autoComplete, defaultValue, visible, onToggle }: PasswordFieldProps) {
  return (
    <label>
      {label}
      <span className="password-field">
        <input
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          required
        />
        <button type="button" className="password-toggle" title={visible ? "Ocultar senha" : "Mostrar senha"} onClick={onToggle}>
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
