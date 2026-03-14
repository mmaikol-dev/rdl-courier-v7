"use client";

import AppLayout from "@/layouts/app-layout";
import { Head, usePage, router } from "@inertiajs/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, XCircle, DollarSign, Edit2, Save, X, LoaderCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function RequisitionShow() {
  const { auth, requisition, flash, duplicateItemsByName = {} } = usePage().props as any;
  const [isUpdating, setIsUpdating] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});
  const [savingItemId, setSavingItemId] = useState<number | null>(null);
  const [isGoingBack, setIsGoingBack] = useState(false);

  useEffect(() => {
    if (flash?.success) {
      toast.success(flash.success);
    } else if (flash?.error) {
      toast.error(flash.error);
    } else if (flash?.errors?.message) {
      toast.error(flash.errors.message);
    }
  }, [flash]);

  const updateStatus = (status: string) => {
    if (isUpdating) return;

    setIsUpdating(true);

    router.patch(
      `/requisitions/${requisition.id}/status`,
      { status },
      {
        preserveScroll: true,
        onSuccess: () => {
          toast.success(`Requisition marked as ${status}`);
          setIsUpdating(false);
          router.reload({ only: ['requisition'] });
        },
        onError: () => {
          toast.error("Failed to update requisition status");
          setIsUpdating(false);
        },
        onFinish: () => setIsUpdating(false),
      }
    );
  };

  const startEditingItem = (item: any) => {
    setEditingItemId(item.id);
    setEditFormData({
      item_name: item.item_name,
      description: item.description || '',
      quantity: item.quantity,
      unit_price: parseFloat(item.unit_price),
    });
  };

  const cancelEditingItem = () => {
    setEditingItemId(null);
    setEditFormData({});
  };

  const saveItemEdit = (itemId: number) => {
    setSavingItemId(itemId);
    router.patch(
      `/requisitions/${requisition.id}/items/${itemId}`,
      editFormData,
      {
        preserveScroll: true,
        onSuccess: () => {
          toast.success("Requisition item updated successfully");
          setEditingItemId(null);
          setEditFormData({});
          router.reload({ only: ['requisition'] });
        },
        onError: (errors) => {
          console.error('Failed to update item:', errors);
          toast.error("Failed to update requisition item");
        },
        onFinish: () => setSavingItemId(null),
      }
    );
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: any = {
      pending: { variant: "secondary", label: "Pending", color: "bg-yellow-100 text-yellow-800" },
      approved: { variant: "default", label: "Approved", color: "bg-green-100 text-green-800" },
      rejected: { variant: "destructive", label: "Rejected", color: "bg-red-100 text-red-800" },
      paid: { variant: "default", label: "Paid", color: "bg-blue-100 text-blue-800" },
    };
    const config = statusConfig[status] || statusConfig.pending;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const breadcrumbs = [
    { title: "Requisitions", href: "/requisitions" },
    { title: requisition.requisition_number, href: "#" },
  ];

  const currentUserRole = String(auth?.user?.roles ?? "").trim().toLowerCase();

  // Check if items can be edited (only pending status and finance role)
  const canEditItems = requisition.status === 'pending' && currentUserRole === 'finance';
  const normalizeItemName = (value: string) => value.trim().toLowerCase();

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title={`Requisition - ${requisition.requisition_number}`} />

      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setIsGoingBack(true);
                router.get("/requisitions", {}, {
                  onError: () => toast.error("Failed to return to requisitions"),
                  onFinish: () => setIsGoingBack(false),
                });
              }}
              disabled={isGoingBack}
              className="flex items-center gap-2"
            >
              {isGoingBack ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <ArrowLeft className="w-4 h-4" />}
              {isGoingBack ? "Loading..." : "Back"}
            </Button>
            <h1 className="text-2xl font-bold text-gray-800">
              {requisition.requisition_number}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {requisition.status === 'pending' && currentUserRole === 'finance' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => updateStatus('approved')}
                  disabled={isUpdating}
                  className="flex items-center gap-2 text-green-600 border-green-600 hover:bg-green-50"
                >
                  {isUpdating ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {isUpdating ? "Processing..." : "Approve"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => updateStatus('rejected')}
                  disabled={isUpdating}
                  className="flex items-center gap-2 text-red-600 border-red-600 hover:bg-red-50"
                >
                  {isUpdating ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  {isUpdating ? "Processing..." : "Reject"}
                </Button>
              </>
            )}
            {requisition.status === 'approved' && currentUserRole === 'finance' && (
              <Button
                onClick={() => updateStatus('paid')}
                disabled={isUpdating}
                className="flex items-center gap-2 text-white"
              >
                {isUpdating ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                {isUpdating ? "Processing..." : "Mark as Paid"}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="shadow-sm">
              <CardHeader className="border-b">
                <CardTitle>Requisition Details</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Title</p>
                    <p className="font-semibold text-gray-800">{requisition.title}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Category</p>
                    <p className="font-semibold text-gray-800">{requisition.category?.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Requisition Date</p>
                    <p className="font-semibold text-gray-800">
                      {new Date(requisition.requisition_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Status</p>
                    <div className="mt-1">{getStatusBadge(requisition.status)}</div>
                  </div>
                </div>

                {requisition.description && (
                  <div>
                    <p className="text-sm text-gray-600">Description</p>
                    <p className="text-gray-800 mt-1">{requisition.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle>Items</CardTitle>
                  {canEditItems && (
                    <Badge variant="secondary" className="text-xs">
                      Editable
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Item Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        {canEditItems && <TableHead className="text-center">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requisition.items?.map((item: any, index: number) => {
                        const duplicateEntries = duplicateItemsByName[normalizeItemName(item.item_name || '')] || [];
                        const isDuplicateItem = duplicateEntries.length > 0;

                        return (
                        <TableRow key={item.id} className={isDuplicateItem ? "bg-red-50/40" : undefined}>
                          <TableCell>{index + 1}</TableCell>

                          {editingItemId === item.id ? (
                            <>
                              <TableCell>
                                <Input
                                  value={editFormData.item_name}
                                  onChange={(e) => setEditFormData({ ...editFormData, item_name: e.target.value })}
                                  className={cn("min-w-[150px]", isDuplicateItem && "border-red-400 bg-red-50 text-red-700")}
                                />
                              </TableCell>
                              <TableCell>
                                <Textarea
                                  value={editFormData.description}
                                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                                  className="min-w-[200px]"
                                  rows={2}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="1"
                                  value={editFormData.quantity}
                                  onChange={(e) => setEditFormData({ ...editFormData, quantity: parseInt(e.target.value) || 1 })}
                                  className="text-right min-w-[80px]"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={editFormData.unit_price}
                                  onChange={(e) => setEditFormData({ ...editFormData, unit_price: parseFloat(e.target.value) || 0 })}
                                  className="text-right min-w-[100px]"
                                />
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                KES {(editFormData.quantity * editFormData.unit_price).toFixed(2)}
                              </TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <span className={isDuplicateItem ? "text-red-700" : undefined}>{item.item_name}</span>
                                  {isDuplicateItem && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex cursor-help items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                                          Duplicate
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs">
                                        <p>
                                          Found in requisition{duplicateEntries.length > 1 ? "s" : ""}: {duplicateEntries.map((entry: any) => entry.requisition_number).join(", ")}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-gray-600">
                                {item.description || '-'}
                              </TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell className="text-right">
                                KES {parseFloat(item.unit_price).toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                KES {parseFloat(item.total_price).toFixed(2)}
                              </TableCell>
                            </>
                          )}

                          {canEditItems && (
                            <TableCell>
                              <div className="flex items-center justify-center gap-2">
                                {editingItemId === item.id ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => saveItemEdit(item.id)}
                                      disabled={savingItemId === item.id}
                                      className="flex items-center gap-1 text-green-600 border-green-600 hover:bg-green-50"
                                    >
                                      {savingItemId === item.id ? <LoaderCircle className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                      {savingItemId === item.id ? "Saving..." : "Save"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={cancelEditingItem}
                                      disabled={savingItemId === item.id}
                                      className="flex items-center gap-1"
                                    >
                                      <X className="w-3 h-3" />
                                      Cancel
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => startEditingItem(item)}
                                    className="flex items-center gap-1"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    Edit
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      )})}
                      <TableRow className="bg-gray-50 font-bold">
                        <TableCell colSpan={canEditItems ? 6 : 5} className="text-right">
                          Grand Total
                        </TableCell>
                        <TableCell className="text-right text-lg">
                          KES {parseFloat(requisition.total_amount).toFixed(2)}
                        </TableCell>
                        {canEditItems && <TableCell />}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="shadow-sm">
              <CardHeader className="border-b">
                <CardTitle>Request Information</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div>
                  <p className="text-sm text-gray-600">Requested By</p>
                  <p className="font-semibold text-gray-800">{requisition.user?.name}</p>
                  <p className="text-sm text-gray-600">{requisition.user?.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Created At</p>
                  <p className="font-semibold text-gray-800">
                    {new Date(requisition.created_at).toLocaleString()}
                  </p>
                </div>
                {requisition.approved_at && (
                  <>
                    <div>
                      <p className="text-sm text-gray-600">Approved By</p>
                      <p className="font-semibold text-gray-800">
                        {requisition.approver?.name || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Approved At</p>
                      <p className="font-semibold text-gray-800">
                        {new Date(requisition.approved_at).toLocaleString()}
                      </p>
                    </div>
                  </>
                )}
                {requisition.paid_at && (
                  <div>
                    <p className="text-sm text-gray-600">Paid At</p>
                    <p className="font-semibold text-gray-800">
                      {new Date(requisition.paid_at).toLocaleString()}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {requisition.daily_budget && (
              <Card className="shadow-sm bg-blue-50 border-blue-200">
                <CardHeader className="border-b border-blue-200">
                  <CardTitle className="text-blue-800">Budget Information</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-3">
                  <div>
                    <p className="text-sm text-blue-700">Budget Date</p>
                    <p className="font-semibold text-blue-900">
                      {new Date(requisition.daily_budget.budget_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-blue-700">Budget Remaining</p>
                    <p className="font-semibold text-blue-900 text-lg">
                      KES {parseFloat(requisition.daily_budget.current_amount).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-blue-700">Budget Spent</p>
                    <p className="font-semibold text-blue-900">
                      KES {parseFloat(requisition.daily_budget.spent_amount).toFixed(2)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

    </AppLayout>
  );
}
