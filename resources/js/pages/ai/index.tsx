"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import AppLayout from "@/layouts/app-layout";
import { type BreadcrumbItem } from "@/types";
import { Head, usePage } from "@inertiajs/react";
import { csrfHeaders } from "@/lib/csrf";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  BrainCircuit,
  ClipboardPaste,
  Package,
  Loader2,
  CheckCircle2,
  Store,
  ShoppingCart,
  Phone,
  MapPin,
  Coins,
  Calendar,
  Send,
  Sparkles,
  Plus,
  PanelLeft,
  PanelLeftClose,
  MessageCircle,
  Trash2,
  Search,
} from "lucide-react";

interface OrderDraft {
  order_date?: string | null;
  amount?: number | string | null;
  quantity?: number | string | null;
  client_name?: string;
  phone?: string | null;
  alt_no?: string | null;
  city?: string | null;
  address?: string | null;
  product_name?: string | null;
  delivery_date?: string | null;
  status?: string | null;
  instructions?: string | null;
  [key: string]: unknown;
}

interface MerchantData {
  sheet_id: string | null;
  tabs: string[];
  countries: string[];
  store_name: string | null;
}

interface Conversation {
  id: number;
  title: string | null;
  chats_count?: number;
  updated_at: string;
}

interface ChatMessage {
  id: number;
  type: "user" | "ai";
  content: string;
  created_at: string;
  loading?: boolean;
  orders?: OrderDraft[] | null;
  created_order_nos?: string[];
}

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Dashboard", href: "/dashboard" },
  { title: "RDL Ai", href: "/ai" },
];

const fieldLabels: Record<string, string> = {
  client_name: "Client",
  phone: "Phone",
  alt_no: "Alt No.",
  city: "City",
  address: "Address",
  product_name: "Product",
  quantity: "Qty",
  amount: "Amount",
  order_date: "Order Date",
  delivery_date: "Delivery Date",
};

const fieldIcons: Record<string, typeof Coins> = {
  client_name: Sparkles,
  phone: Phone,
  city: MapPin,
  address: MapPin,
  product_name: Package,
  quantity: ShoppingCart,
  amount: Coins,
  order_date: Calendar,
  delivery_date: Calendar,
};

export default function RdlAi() {
  const { auth, history, conversations, currentConversationId, merchants, statusOptions } = usePage().props as unknown as {
    auth: { user: { name: string; roles?: string } };
    history?: Array<{ id: number; role: string; content: string; order_data?: OrderDraft[] | null; created_at: string }>;
    conversations?: Conversation[];
    currentConversationId?: number | null;
    merchants?: Record<string, MerchantData>;
    statusOptions?: string[];
  };

  const username = auth?.user?.name || "User";
  const isGlobal = (auth?.user?.roles || "").toLowerCase() === "g.o.d";

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversationList, setConversationList] = useState<Conversation[]>(conversations ?? []);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(
    currentConversationId ?? null
  );
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    (history ?? []).map((h) => ({
      id: h.id,
      type: h.role === "user" ? "user" : "ai",
      content: h.content,
      created_at: h.created_at,
      orders: h.role === "assistant" ? h.order_data ?? null : null,
    }))
  );
  const [input, setInput] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [pendingOrders, setPendingOrders] = useState<OrderDraft[] | null>(null);
  const [selectedMerchant, setSelectedMerchant] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("Scheduled");
  const [groupSheets, setGroupSheets] = useState<Record<number, string>>({});
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSwitchingChat, setIsSwitchingChat] = useState(false);
  const [isDeletingChat, setIsDeletingChat] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingOrders]);

  const merchantOptions = useMemo(() => Object.keys(merchants ?? {}).sort(), [merchants]);
  const sheetNames = useMemo(() => merchants?.[selectedMerchant]?.tabs ?? [], [merchants, selectedMerchant]);
  const merchantCountries = useMemo(() => merchants?.[selectedMerchant]?.countries ?? [], [merchants, selectedMerchant]);

  // Group extracted orders by product name (normalized)
  const orderGroups = useMemo(() => {
    if (!pendingOrders || pendingOrders.length === 0) return [];
    const map = new Map<string, OrderDraft[]>();
    pendingOrders.forEach((order) => {
      const raw = (order.product_name ?? "").trim();
      const key = raw.toLowerCase() || "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(order);
    });
    return [...map.entries()].map(([key, orders]) => ({
      key,
      label: key === "__none__" ? "No product" : orders[0]?.product_name ?? key,
      orders,
    }));
  }, [pendingOrders]);

  // Suggest sheets per product group when merchant or groups change
  useEffect(() => {
    if (!selectedMerchant || orderGroups.length === 0) return;
    setIsSuggesting(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    fetch("/ai/suggest-sheets", {
      method: "POST",
      headers: postHeaders(),
      body: JSON.stringify({
        merchant: selectedMerchant,
        product_names: orderGroups.map((g) => (g.key === "__none__" ? "" : g.label)),
      }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.suggestions) {
          setGroupSheets(
            orderGroups.reduce<Record<number, string>>((acc, g, i) => {
              const product = g.key === "__none__" ? "" : g.label;
              const suggestion = data.suggestions[product];
              acc[i] = suggestion && sheetNames.some((s) => s.toLowerCase() === suggestion.toLowerCase()) ? suggestion : "";
              return acc;
            }, {})
          );
        }
      })
      .catch(() => {
        /* suggestions are optional */
      })
      .finally(() => setIsSuggesting(false));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [selectedMerchant, orderGroups]);

  const filteredConversations = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    const list = [...conversationList].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
    if (!q) return list;
    return list.filter((c) => (c.title ?? "New chat").toLowerCase().includes(q));
  }, [conversationList, chatSearch]);

  const postHeaders = () => ({
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    ...csrfHeaders(),
  });

  const newChat = async () => {
    try {
      const response = await fetch("/ai/conversations", {
        method: "POST",
        headers: postHeaders(),
      });
      const data = await response.json();

      if (data.success) {
        setConversationList((prev) => [data.conversation, ...prev]);
        setActiveConversationId(data.conversation.id);
        setMessages([]);
        setPendingOrders(null);
      } else {
        toast.error("Failed to create chat");
      }
    } catch (error) {
      toast.error("Failed to create chat");
    }
  };

  const switchChat = async (id: number) => {
    if (id === activeConversationId) return;
    setIsSwitchingChat(true);
    setPendingOrders(null);

    try {
      const response = await fetch(`/ai/conversations/${id}`, {
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      const data = await response.json();

      if (data.success) {
        setMessages(
          data.messages.map((m: { id: number; role: string; content: string; order_data?: OrderDraft[] | null; created_at: string }) => ({
            id: m.id,
            type: m.role === "user" ? "user" : "ai",
            content: m.content,
            created_at: m.created_at,
            orders: m.role === "assistant" ? m.order_data ?? null : null,
          }))
        );
        setActiveConversationId(id);
      } else {
        toast.error("Failed to load chat");
      }
    } catch (error) {
      toast.error("Failed to load chat");
    } finally {
      setIsSwitchingChat(false);
    }
  };

  const deleteChat = async (id: number) => {
    if (!confirm("Delete this chat and all its messages?")) return;
    setIsDeletingChat(id);

    try {
      const response = await fetch(`/ai/conversations/${id}`, {
        method: "DELETE",
        headers: postHeaders(),
      });
      const data = await response.json();

      if (data.success) {
        setConversationList((prev) => prev.filter((c) => c.id !== id));
        if (activeConversationId === id) {
          setActiveConversationId(null);
          setMessages([]);
          setPendingOrders(null);
        }
        toast.success("Chat deleted");
      } else {
        toast.error("Failed to delete chat");
      }
    } catch (error) {
      toast.error("Failed to delete chat");
    } finally {
      setIsDeletingChat(null);
    }
  };

  const sendMessage = async (preset?: string) => {
    const content = preset || input;
    if (!content.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now(),
      type: "user",
      content,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setPendingOrders(null);

    const thinkingId = Date.now() + 1;
    setMessages((prev) => [
      ...prev,
      { id: thinkingId, type: "ai", content: "", created_at: new Date().toISOString(), loading: true },
    ]);

    try {
      const response = await fetch("/ai/ask", {
        method: "POST",
        headers: postHeaders(),
        body: JSON.stringify({
          message: content,
          conversation_id: activeConversationId ?? undefined,
        }),
      });
      const data = await response.json();
      const errors: Record<string, string[]> | undefined = data?.errors;
      const firstError = errors ? Object.values(errors)[0]?.[0] : undefined;
      const errorText = !response.ok
        ? String(data?.message || firstError || data?.reply || "Request failed")
        : null;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === thinkingId
            ? {
                ...msg,
                content: (errorText ?? data.reply) || "AI did not respond.",
                loading: false,
                orders: data.orders ?? null,
              }
            : msg
        )
      );

      if (data.conversation_id) {
        setActiveConversationId(data.conversation_id);
        const convId: number = data.conversation_id;
        setConversationList((prev) => {
          const exists = prev.some((c) => c.id === convId);
          const entry: Conversation = {
            id: convId,
            title: exists ? prev.find((c) => c.id === convId)?.title ?? null : content.slice(0, 60),
            updated_at: new Date().toISOString(),
          };
          return exists ? prev.map((c) => (c.id === convId ? entry : c)) : [entry, ...prev];
        });
      }

      if (data.orders && data.orders.length > 0) {
        setPendingOrders(data.orders);
      }
    } catch (error) {
      toast.error("Failed to get AI response");
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === thinkingId ? { ...msg, content: "Failed to respond", loading: false } : msg
        )
      );
    }
  };

  const createOrders = async () => {
    if (!pendingOrders || pendingOrders.length === 0) return;
    if (!selectedMerchant) {
      toast.error("Please select a merchant first");
      return;
    }
    if (orderGroups.some((_, i) => !groupSheets[i])) {
      toast.error("Please pick a tab for every product group");
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch("/ai/create-orders", {
        method: "POST",
        headers: postHeaders(),
        body: JSON.stringify({
          merchant: selectedMerchant,
          status: selectedStatus,
          groups: orderGroups.map((g, i) => ({
            sheet_name: groupSheets[i],
            sheet_id: merchants?.[selectedMerchant]?.sheet_id ?? null,
            orders: g.orders,
          })),
        }),
      });
      const data = await response.json();

      if (data.success) {
        toast.success(data.message);
        const orderNos: string[] = (data.orders ?? []).map((o: { order_no: string }) => o.order_no);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            type: "ai",
            content: data.message,
            created_at: new Date().toISOString(),
            created_order_nos: orderNos,
          },
        ]);
        setPendingOrders(null);
        setSelectedMerchant("");
        setGroupSheets({});
      } else {
        toast.error(data.message || "Failed to create orders");
      }
    } catch (error) {
      toast.error("Failed to create orders");
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const renderOrderFields = (order: OrderDraft) => (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
      {(["client_name", "phone", "city", "address", "product_name", "quantity", "amount", "order_date", "delivery_date"] as const).map((field) => {
        const value = order[field];
        if (value === null || value === undefined || value === "") return null;
        const Icon = fieldIcons[field];
        return (
          <div key={field} className="flex items-center gap-1.5">
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">{fieldLabels[field]}:</span>
            <span className="truncate font-medium">{String(value)}</span>
          </div>
        );
      })}
    </div>
  );

  const suggestions = [
    { icon: <ClipboardPaste size={18} />, text: "Paste orders here, e.g. from WhatsApp or notes" },
    { icon: <ShoppingCart size={18} />, text: "Create 3 orders: Jane 2x shoes KES 2800, John 1x belt KES 900, Achieng 1x dress KES 1500" },
    { icon: <Package size={18} />, text: "Create order for Peter, phone 0712345678, 1 x blender, amount 4500, Nairobi" },
    { icon: <Phone size={18} />, text: "Customer: Ann Wanjiru, +254722000111, 2 bags of flour @ 900 each" },
  ];

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="RDL Ai" />

      <div className="flex h-[calc(100svh-4rem)] gap-4 p-4 group-has-data-[collapsible=icon]/sidebar-wrapper:h-[calc(100svh-3rem)]">
        {/* Sidebar */}
        <aside
          className={`shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out ${
            sidebarOpen ? "w-72" : "w-0"
          }`}
        >
          <div className="flex h-full w-72 flex-col gap-3 rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                  <BrainCircuit className="size-4.5 text-primary" />
                </div>
                <span className="text-sm font-semibold">Elly</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setSidebarOpen(false)}
                title="Hide sidebar"
              >
                <PanelLeftClose className="size-4" />
              </Button>
            </div>

            <Button onClick={newChat} className="w-full justify-start gap-2">
              <Plus className="size-4" />
              New chat
            </Button>

            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search chats..."
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                className="h-9 pl-8"
              />
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto pr-0.5">
              {filteredConversations.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {chatSearch ? "No chats match your search" : "No chats yet — start a new one"}
                </p>
              ) : (
                filteredConversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                      activeConversationId === conv.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                    }`}
                    onClick={() => switchChat(conv.id)}
                  >
                    <MessageCircle className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{conv.title || "New chat"}</p>
                      <p className="text-xs text-muted-foreground">
                        {conv.updated_at ? formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true }) : ""}
                        {conv.chats_count ? ` · ${conv.chats_count} msgs` : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 opacity-0 group-hover:opacity-100"
                      title="Delete chat"
                      disabled={isDeletingChat === conv.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChat(conv.id);
                      }}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            >
              <PanelLeft className="size-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">
                {activeConversationId
                  ? conversationList.find((c) => c.id === activeConversationId)?.title || "RDL Ai"
                  : "RDL Ai"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {isSwitchingChat ? "Loading chat..." : messages.length > 0 ? `${messages.length} message(s)` : "New chat"}
              </p>
            </div>
          </div>

          {/* Chat area */}
          <Card className="min-h-0 flex-1 overflow-hidden">
            <CardContent className="flex h-full flex-col gap-4 p-0">
              <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
                {messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-6 py-10 text-center">
                    <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
                      <BrainCircuit className="size-8 text-primary" />
                    </div>
                    <div className="space-y-1.5">
                      <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                        Hi, {username} 👋 I'm <span className="text-primary">Elly</span>
                      </h2>
                      <p className="mx-auto max-w-md text-sm text-muted-foreground">
                        Paste your orders in bulk and I'll extract them. You pick the merchant and create them all at
                        once.
                      </p>
                    </div>

                    <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(s.text)}
                          className="group flex items-start gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                            {s.icon}
                          </span>
                          <p className="text-sm font-medium text-card-foreground">{s.text}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg) =>
                    msg.type === "user" ? (
                      <div key={msg.id} className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground sm:max-w-[70%]">
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          <span className="mt-1 block text-right text-xs text-primary-foreground/60">
                            {formatTime(msg.created_at)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div key={msg.id} className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm text-card-foreground sm:max-w-[70%]">
                          {msg.loading ? (
                            <div className="flex items-center gap-2 py-1">
                              <Loader2 className="size-4 animate-spin text-muted-foreground" />
                              <span className="text-muted-foreground">Thinking...</span>
                            </div>
                          ) : (
                            <>
                              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                              {msg.created_order_nos && msg.created_order_nos.length > 0 && (
                                <div className="mt-2.5 flex flex-wrap gap-1.5">
                                  {msg.created_order_nos.map((no) => (
                                    <Badge key={no} variant="default" className="gap-1">
                                      <CheckCircle2 className="size-3" />
                                      {no}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                          {!msg.loading && (
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {formatTime(msg.created_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  )
                )}
                <div ref={messagesEndRef} />
              </div>
            </CardContent>
          </Card>

          {/* Order extraction / create panel */}
          {pendingOrders && pendingOrders.length > 0 && (
            <Card className="shrink-0">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Package className="size-4 text-primary" />
                    Extracted orders
                  </CardTitle>
                  <Badge variant="secondary">
                    {pendingOrders.length} order{pendingOrders.length > 1 ? "s" : ""}
                  </Badge>
                </div>
                <CardDescription>
                  Orders are grouped by product. Pick the merchant, then choose which tab each group goes to.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                  {orderGroups.map((group, i) => (
                    <div key={group.key} className="space-y-2.5 rounded-xl border bg-muted/50 p-3.5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <Package className="size-4 text-primary" />
                          <span className="truncate text-sm font-semibold">{group.label}</span>
                          <Badge variant="outline">{group.orders.length}</Badge>
                        </div>
                        <Select
                          value={groupSheets[i] ?? ""}
                          onValueChange={(v) => setGroupSheets((prev) => ({ ...prev, [i]: v }))}
                          disabled={!selectedMerchant}
                        >
                          <SelectTrigger className="h-9 w-full sm:w-64">
                            <SelectValue
                              placeholder={
                                selectedMerchant
                                  ? isSuggesting
                                    ? "Suggesting..."
                                    : "Select tab"
                                  : "Pick merchant first"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {sheetNames.map((sn) => (
                              <SelectItem key={sn} value={sn}>
                                {sn}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        {group.orders.map((order, j) => (
                          <div
                            key={j}
                            className="flex items-start justify-between gap-2 rounded-lg border bg-card px-3 py-2"
                          >
                            {renderOrderFields(order)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Select
                    value={selectedMerchant}
                    onValueChange={(v) => {
                      setSelectedMerchant(v);
                      setGroupSheets({});
                    }}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select merchant" />
                    </SelectTrigger>
                    <SelectContent>
                      {merchantOptions.map((merchant) => (
                        <SelectItem key={merchant} value={merchant}>
                          <span className="flex items-center gap-2">
                            <Store className="size-3.5" />
                            {merchant}
                            {merchants?.[merchant]?.store_name && (
                              <span className="text-muted-foreground">({merchants[merchant].store_name})</span>
                            )}
                            {isGlobal && merchantCountries.length > 0 && (
                              <span className="text-muted-foreground">— {merchantCountries.join(", ")}</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {(statusOptions ?? ["Scheduled"]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={createOrders} disabled={!selectedMerchant || isCreating} className="w-full sm:w-auto">
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 size-4" />
                      Create {pendingOrders.length} Order{pendingOrders.length > 1 ? "s" : ""}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Input area */}
          <div className="flex shrink-0 items-end gap-2">
            <Textarea
              placeholder="Paste your orders here... (e.g. from WhatsApp or notes)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              rows={2}
              className="min-h-[3.5rem] flex-1 resize-none"
            />
            <Button onClick={() => sendMessage()} size="icon" className="h-14 w-14 shrink-0" title="Send">
              <Send className="size-5" />
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
