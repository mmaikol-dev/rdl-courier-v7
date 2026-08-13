"use client";

import AppLayout from "@/layouts/app-layout";
import { Head, usePage } from "@inertiajs/react";
import { useState, useRef, useEffect } from "react";
import { type BreadcrumbItem } from "@/types";
import { csrfHeaders } from "@/lib/csrf";
import {
  Check,
  CheckCheck,
  Send,
  Search,
  MoreVertical,
  Phone,
  Video,
  Paperclip,
  Smile,
  Clock,
  MessageSquare,
  Image,
  File,
  Music,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Chat {
  id: number;
  to: string;
  client_name: string;
  store_name: string;
  cc_agents?: string; // 👈 Added cc_agents field
  status: string; // sent | delivered | read
  sid: string;
  message: string;
  created_at: string;
  updated_at: string;
  type?: string; // 1 for green dot
}

interface Conversation {
  phone: string;
  client_name: string;
  store_name: string;
  cc_agents?: string; // 👈 Added cc_agents field
  messages: Chat[];
  latest_at: string;
}

const BREADCRUMBS: BreadcrumbItem[] = [
  { title: "Dashboard", href: "/dashboard" },
  { title: "WhatsApp Chats", href: "/whatsapp" },
];

export default function WhatsAppPage() {
  const { conversations: initialConversations, pagination: initialPagination } = usePage<{ conversations: Conversation[]; pagination: any }>().props;
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [pagination, setPagination] = useState(initialPagination);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [message, setMessage] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Conversation[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Merge incoming conversations from polling into existing state
  const mergeConversations = (existing: Conversation[], incoming: Conversation[]): Conversation[] => {
    const merged = new Map(existing.map(c => [c.phone, { ...c, messages: [...c.messages] }]));

    for (const inc of incoming) {
      const existing = merged.get(inc.phone);
      if (existing) {
        const seenIds = new Set(existing.messages.map(m => m.id));
        for (const msg of inc.messages) {
          const matchIdx = existing.messages.findIndex(m => m.id === msg.id);
          if (matchIdx >= 0) {
            existing.messages[matchIdx] = msg;
          } else if (!seenIds.has(msg.id) && msg.id > 0) {
            existing.messages.push(msg);
            seenIds.add(msg.id);
          }
        }
        existing.messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        existing.latest_at = existing.messages.length > 0 ? existing.messages[existing.messages.length - 1].created_at : existing.latest_at;
        existing.client_name = inc.client_name || existing.client_name;
        existing.cc_agents = inc.cc_agents || existing.cc_agents;
      } else {
        merged.set(inc.phone, inc);
      }
    }

    return Array.from(merged.values()).sort((a, b) => new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime());
  };

  // Scroll to bottom when chat changes or messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected?.messages, selected]);

  // Update selected conversation when conversations change
  useEffect(() => {
    if (selected) {
      const updatedSelected = conversations.find(conv => conv.phone === selected.phone);
      if (updatedSelected) {
        setSelected(updatedSelected);
      }
    }
  }, [conversations, selected?.phone]);

  // Poll for new messages every 5 seconds (paused when searching)
  useEffect(() => {
    if (searchResults !== null) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/whatsapp/conversations?since=" + encodeURIComponent(new Date().toISOString()));
        if (!res.ok) return;
        const data = await res.json();
        if (data.conversations?.length > 0) {
          setConversations(prev => mergeConversations(prev, data.conversations));
        }
      } catch {
        // silent
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [searchResults]);

  // Apply sidebar country filter (for G.O.D users who see all countries)
  const pageProps = usePage().props as Record<string, unknown>;
  const selectedCountry = pageProps.selectedCountry as string | null | undefined;

  const filterByCountry = (list: Conversation[]) => {
    if (!selectedCountry || selectedCountry === '__all__') return list;
    const target = selectedCountry.toLowerCase();
    return list.filter(conv => conv.store_name?.toLowerCase() === target);
  };

  const filterByAgent = (list: Conversation[]) => {
    if (!agentFilter || agentFilter === 'all') return list;
    return list.filter(conv =>
      conv.cc_agents?.toLowerCase().includes(agentFilter.toLowerCase())
    );
  };

  const uniqueAgents = Array.from(
    new Set(
      conversations.flatMap(conv =>
        (conv.cc_agents ?? '')
          .split(',')
          .map(a => a.trim())
          .filter(Boolean)
      )
    )
  ).sort((a, b) => a.localeCompare(b));

  // Conversations to display: search results when searching, normal list otherwise
  const displayConversations = filterByAgent(
    filterByCountry(searchResults !== null ? searchResults : conversations)
  );

  const handleSearchEnter = async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch("/api/whatsapp/conversations?search=" + encodeURIComponent(q) + "&per_page=100");
      const data = await res.json();
      setSearchResults(data.conversations || []);
    } catch {
      // silent
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults(null);
    setIsSearching(false);
  };

  const markAsRead = (conv: Conversation) => {
    const phone = conv.phone.replace(/[^0-9]/g, '');
    fetch(`/chats/${phone}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...csrfHeaders(),
      },
      body: JSON.stringify({ type: "0" }),
    }).catch(() => {});
    setConversations(prev =>
      prev.map(c =>
        c.phone === conv.phone
          ? { ...c, messages: c.messages.map(m => ({ ...m, type: "0" })) }
          : c
      )
    );
    setSelected(prev => prev?.phone === conv.phone
      ? { ...prev, messages: prev.messages.map(m => ({ ...m, type: "0" })) }
      : prev
    );
  };

  const handleSelectConversation = (conv: Conversation) => {
    setSelected(conv);
    markAsRead(conv);
  };

  const renderStatusIcon = (status: string) => {
    switch (status) {
      case "sent":
        return <Check className="w-3 h-3 text-muted-foreground" />;
      case "delivered":
        return <CheckCheck className="w-3 h-3 text-muted-foreground" />;
      case "read":
        return <CheckCheck className="w-3 h-3 text-blue-500" />;
      case "failed":
        return <Clock className="w-3 h-3 text-muted-foreground animate-pulse" />;
      default:
        return null;
    }
  };

  const getInitials = (name: string, phone: string) => {
    if (name && name !== phone) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return phone.slice(-2);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } else if (diffInHours < 168) { // 7 days
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    }
  };

  const handleSend = async () => {
    if (!selected || !message.trim()) return;

    const newMsg: Chat = {
      id: Date.now(),
      to: selected.phone,
      client_name: selected.client_name,
      store_name: selected.store_name,
      cc_agents: selected.cc_agents, // 👈 Include cc_agents
      status: "pending",
      sid: "",
      message: message.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      type: "0",
    };

    // Update conversations with the new message (optimistic update)
    setConversations(prevConversations =>
      prevConversations.map(conv =>
        conv.phone === selected.phone
          ? {
            ...conv,
            messages: [...conv.messages, newMsg],
            latest_at: newMsg.created_at,
          }
          : conv
      )
    );

    setMessage("");

    try {
      const res = await fetch("/api/whatsapp/send-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ to: selected.phone, message: newMsg.message }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Update optimistic message with real DB id and sent status
        setConversations(prevConversations =>
          prevConversations.map(conv =>
            conv.phone === selected.phone
              ? {
                ...conv,
                messages: conv.messages.map(msg =>
                  msg.id === newMsg.id ? { ...msg, id: data.id, status: "sent", sid: data.sid || "" } : msg
                )
              }
              : conv
          )
        );
      } else {
        alert("Failed to send message.");
        // Rollback optimistic update
        setConversations(prevConversations =>
          prevConversations.map(conv =>
            conv.phone === selected.phone
              ? {
                ...conv,
                messages: conv.messages.filter(msg => msg.id !== newMsg.id)
              }
              : conv
          )
        );
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while sending the message.");
      // Rollback optimistic update
      setConversations(prevConversations =>
        prevConversations.map(conv =>
          conv.phone === selected.phone
            ? {
              ...conv,
              messages: conv.messages.filter(msg => msg.id !== newMsg.id)
            }
            : conv
        )
      );
    }
  };

  const getUnreadCount = (conversation: Conversation) => {
    return conversation.messages.filter(msg => msg.type === "1").length;
  };

  const renderMessageContent = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.startsWith("[Image received")) {
      const caption = trimmed.replace("[Image received]", "").replace(/^:?\s*/, "");
      return (
        <div className="flex items-center gap-2">
          <Image className="w-5 h-5 shrink-0" />
          {caption ? <span className="truncate text-sm">{caption}</span> : <span className="text-sm">Image</span>}
        </div>
      );
    }
    if (trimmed.startsWith("[Video received")) {
      const caption = trimmed.replace("[Video received]", "").replace(/^:?\s*/, "");
      return (
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5 shrink-0" />
          {caption ? <span className="truncate text-sm">{caption}</span> : <span className="text-sm">Video</span>}
        </div>
      );
    }
    if (trimmed.startsWith("[Audio received")) {
      return (
        <div className="flex items-center gap-2">
          <Music className="w-5 h-5 shrink-0" />
          <span className="text-sm">Audio</span>
        </div>
      );
    }
    if (trimmed.startsWith("[Document received")) {
      const name = trimmed.replace("[Document received: ", "").replace("]", "");
      return (
        <div className="flex items-center gap-2">
          <File className="w-5 h-5 shrink-0" />
          <span className="truncate text-sm">{name}</span>
        </div>
      );
    }
    if (trimmed.startsWith("[Sticker received")) {
      return (
        <div className="flex items-center gap-2">
          <File className="w-5 h-5 shrink-0" />
          <span className="text-sm">Sticker</span>
        </div>
      );
    }
    return <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{text}</p>;
  };

  const loadMore = async () => {
    if (loadingMore || !pagination?.has_more_pages) return;
    setLoadingMore(true);
    try {
      const nextPage = (pagination.current_page || 1) + 1;
      const perPage = pagination.per_page || 50;
      const res = await fetch(`/api/whatsapp/conversations?page=${nextPage}&per_page=${perPage}`);
      const data = await res.json();
      if (data.conversations) {
        setConversations(prev => {
          const existingPhones = new Set(prev.map(c => c.phone));
          const newOnes = data.conversations.filter(c => !existingPhones.has(c.phone));
          return [...prev, ...newOnes];
        });
        setPagination(data.pagination);
      }
    } catch {
      console.error("Failed to load more conversations");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <AppLayout breadcrumbs={BREADCRUMBS}>
      <Head title="WhatsApp Chats" />

      {/* Success Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCheck className="w-5 h-5 text-green-500" />
              Message Sent
            </DialogTitle>
            <DialogDescription>
              Your WhatsApp message has been sent successfully.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button onClick={() => setShowModal(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex h-[calc(100vh-120px)] bg-background rounded-lg border overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 border-r bg-muted/30 flex flex-col">
          {/* Sidebar Header */}
          <div className="p-4 border-b bg-background/50 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-green-600" />
                WhatsApp Chats
              </h2>
              <Button variant="ghost" size="sm">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearchEnter();
                  }
                }}
                className="pl-10 pr-8 bg-background"
              />
              {searchResults !== null && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Agent Filter */}
            {uniqueAgents.length > 0 && (
              <div className="mt-3">
                <Select value={agentFilter} onValueChange={setAgentFilter}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Filter by agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All agents</SelectItem>
                    {uniqueAgents.map(agent => (
                      <SelectItem key={agent} value={agent}>
                        {agent}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto">
            {displayConversations.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No chats available</p>
                {searchQuery && (
                  <p className="text-sm mt-1">Try a different search term</p>
                )}
              </div>
            ) : (
              <div className="divide-y">
                {displayConversations.map((conv, idx) => {
                  const lastMsg = conv.messages[conv.messages.length - 1];
                  const unreadCount = getUnreadCount(conv);
                  const isSelected = selected?.phone === conv.phone;

                  return (
                    <div
                      key={idx}
                      onClick={() => handleSelectConversation(conv)}
                      className={cn(
                        "p-4 cursor-pointer transition-colors hover:bg-muted/50",
                        isSelected && "bg-muted border-r-2 border-r-primary"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="w-12 h-12">
                          <AvatarFallback className="bg-gradient-to-br from-green-400 to-green-600 text-white font-medium">
                            {getInitials(conv.client_name, conv.phone)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">
                                {conv.client_name || conv.phone}
                              </span>
                              {lastMsg?.type === "1" && (
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">
                                {formatTime(conv.latest_at)}
                              </span>
                              {unreadCount > 0 && (
                                <Badge variant="default" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-green-600">
                                  {unreadCount}
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <div className="text-sm text-muted-foreground truncate flex-1">
                              {lastMsg?.message.startsWith("[") ? renderMessageContent(lastMsg.message) : lastMsg?.message}
                            </div>
                            {lastMsg && renderStatusIcon(lastMsg.status)}
                          </div>

                          {/* 👇 Changed to show cc_agents instead of store_name */}
                          <p className="text-xs text-muted-foreground mt-1">
                            {conv.cc_agents || 'No agent assigned'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {pagination?.has_more_pages && searchResults === null && (
              <div className="p-3 text-center">
                <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Load more
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Chat Window */}
        <div className="flex-1 flex flex-col">
          {selected ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b bg-background/95 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-gradient-to-br from-green-400 to-green-600 text-white">
                        {getInitials(selected.client_name, selected.phone)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-medium">
                        {selected.client_name || selected.phone}
                      </h3>
                      {/* 👇 Changed to show cc_agents instead of store_name */}
                      <p className="text-sm text-muted-foreground">
                        {selected.phone} • {selected.cc_agents || 'No agent'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm">
                      <Phone className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Video className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 p-4 overflow-y-auto">
                <div className="space-y-4">
                  {selected.messages.map((msg, index) => {
                    const isOutgoing = ["sent", "delivered", "read", "pending"].includes(msg.status);
                    const showTimestamp = index === 0 ||
                      new Date(msg.created_at).getDate() !== new Date(selected.messages[index - 1].created_at).getDate();

                    return (
                      <div key={msg.id}>
                        {showTimestamp && (
                          <div className="text-center my-4">
                            <span className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                              {new Date(msg.created_at).toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </span>
                          </div>
                        )}

                        <div
                          className={cn(
                            "flex",
                            isOutgoing ? "justify-end" : "justify-start"
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[70%] rounded-2xl px-4 py-2 relative",
                              isOutgoing
                                ? "bg-green-600 text-white rounded-br-md"
                                : "bg-muted rounded-bl-md"
                            )}
                          >
                            {renderMessageContent(msg.message)}
                            <div className="flex items-center justify-end gap-1 mt-1">
                              <span className={cn(
                                "text-xs",
                                isOutgoing ? "text-green-100" : "text-muted-foreground"
                              )}>
                                {new Date(msg.created_at).toLocaleTimeString('en-US', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: false
                                })}
                              </span>
                              {isOutgoing && (
                                <div className="text-green-100">
                                  {renderStatusIcon(msg.status)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="p-4 border-t bg-background/95 backdrop-blur-sm">
                <div className="flex items-end gap-2">
                  <Button variant="ghost" size="sm" className="mb-1">
                    <Paperclip className="w-4 h-4" />
                  </Button>

                  <div className="flex-1 relative">
                    <Input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Type a message..."
                      className="pr-10 min-h-[40px] resize-none rounded-full bg-muted"
                      multiline
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2"
                    >
                      <Smile className="w-4 h-4" />
                    </Button>
                  </div>

                  <Button
                    onClick={handleSend}
                    disabled={!message.trim()}
                    size="sm"
                    className="mb-1 rounded-full w-10 h-10 p-0 bg-green-600 hover:bg-green-700"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
              <MessageSquare className="w-16 h-16 mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">Welcome to WhatsApp Business</h3>
              <p className="text-center max-w-md">
                Select a chat from the sidebar to start messaging your customers.
                All your conversations are organized and ready for you.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}