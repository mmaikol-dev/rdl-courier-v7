"use client";

import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from '@/components/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Check, ChevronsUpDown, Edit, Eye, EyeOff, Globe2, Loader2, Plus, Search, Shield, Trash2, UserRound } from 'lucide-react';
import * as React from 'react';

const breadcrumbs: BreadcrumbItem[] = [
  { title: 'Dashboard', href: '/dashboard' },
  { title: 'Users', href: '/users' },
];

const eastAfricanCountries = [
  'Kenya',
  'Tanzania',
  'Uganda',
  'Rwanda',
  'Burundi',
  'South Sudan',
  'Ethiopia',
  'Somalia',
  'DR Congo',
];

const roleOptions = [
  'admin',
  'g.o.d',
  'superadmin',
  'operations',
  'finance',
  'callcenter1',
  'merchant',
  'agent',
  'warehouse',
];

interface CountryOption {
  id: number;
  name: string;
}

interface UserRecord {
  id: number;
  username?: string | null;
  name: string;
  email: string;
  email_verified_at?: string | null;
  store_name?: string | null;
  store_address?: string | null;
  store_phone?: string | null;
  store_email?: string | null;
  roles?: string | null;
  country_id?: number | null;
  country?: { id: number; name: string } | null;
  photo?: string | null;
  created_at: string;
  updated_at: string;
}

interface PaginationLinkData {
  url: string | null;
  label: string;
  active: boolean;
}

interface PaginatedUsers {
  data: UserRecord[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  links: PaginationLinkData[];
}

interface UsersPageProps {
  users: PaginatedUsers;
  search: string;
  countries: CountryOption[];
  auth: {
    user: {
      roles?: string;
      country?: { id: number; name: string } | null;
    };
  };
}

type UserFormData = {
  username: string;
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
  store_name: string;
  store_address: string;
  store_phone: string;
  store_email: string;
  roles: string;
  country_id: string;
  photo: string;
  email_verified_at: string;
  email_verified: boolean;
};

const emptyForm: UserFormData = {
  username: '',
  name: '',
  email: '',
  password: '',
  password_confirmation: '',
  store_name: '',
  store_address: '',
  store_phone: '',
  store_email: '',
  roles: 'admin',
  country_id: '',
  photo: '',
  email_verified_at: '',
  email_verified: false,
};

function normalizeUserToForm(user: UserRecord): UserFormData {
  const verified = !!user.email_verified_at;
  return {
    username: user.username ?? '',
    name: user.name ?? '',
    email: user.email ?? '',
    password: '',
    password_confirmation: '',
    store_name: user.store_name ?? '',
    store_address: user.store_address ?? '',
    store_phone: user.store_phone ?? '',
    store_email: user.store_email ?? '',
    roles: user.roles ?? 'admin',
    country_id: user.country_id ? String(user.country_id) : '',
    photo: user.photo ?? '',
    email_verified_at: user.email_verified_at ?? '',
    email_verified: verified,
  };
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return <p className="text-xs text-destructive">{message}</p>;
}

export default function UsersPage() {
  const { users, search, countries, auth } = usePage<UsersPageProps>().props;
  const currentUserRole = auth?.user?.roles ?? '';
  const currentCountryName = auth?.user?.country?.name ?? 'No country assigned';
  const canManageUsers = !['operations', 'finance', 'callcenter1', ''].includes(currentUserRole);
  const canChooseCountry = currentUserRole?.toLowerCase() === 'g.o.d';

  const [filter, setFilter] = React.useState(search ?? '');
  const [editingUser, setEditingUser] = React.useState<UserRecord | null>(null);
  const [creatingUser, setCreatingUser] = React.useState(false);
  const [deletingUser, setDeletingUser] = React.useState<UserRecord | null>(null);
  const [deleteProcessing, setDeleteProcessing] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = React.useState(false);

  const form = useForm<UserFormData>(emptyForm);

  const doSearch = React.useCallback(() => {
    router.get('/users', { search: filter }, { preserveState: true, replace: true });
  }, [filter]);

  const openCreate = () => {
    setEditingUser(null);
    setCreatingUser(true);
    setShowPassword(false);
    setShowPasswordConfirmation(false);
    form.clearErrors();
    form.setData({
      ...emptyForm,
      country_id: canChooseCountry ? '' : (countries[0] ? String(countries[0].id) : ''),
    });
  };

  const openEdit = (user: UserRecord) => {
    setCreatingUser(false);
    setEditingUser(user);
    setShowPassword(false);
    setShowPasswordConfirmation(false);
    form.clearErrors();
    form.setData(normalizeUserToForm(user));
  };

  const closeFormDialog = () => {
    setCreatingUser(false);
    setEditingUser(null);
    setShowPassword(false);
    setShowPasswordConfirmation(false);
    form.reset();
    form.clearErrors();
  };

  const submit = () => {
    const resolveVerified = (data: UserFormData) => ({
      ...data,
      country_id: data.country_id || null,
      email_verified_at: data.email_verified ? (data.email_verified_at || new Date().toISOString()) : null,
    });

    if (editingUser) {
      form.transform((data) => ({
        ...resolveVerified(data),
        password: data.password.trim() === '' ? null : data.password,
        password_confirmation: data.password.trim() === '' ? null : data.password_confirmation,
      }));

      form.put(`/users/${editingUser.id}`, {
        preserveScroll: true,
        onSuccess: () => {
          toast.success('User updated successfully');
          closeFormDialog();
          router.reload({ only: ['users', 'countries'] });
        },
        onError: (errors) => {
          const firstError = Object.values(errors)[0];
          toast.error(typeof firstError === 'string' ? firstError : 'Failed to update user');
        },
        onFinish: () => form.transform((data) => data),
      });

      return;
    }

    form.transform((data) => ({
      ...resolveVerified(data),
      password: data.password || 'password123',
      password_confirmation: data.password_confirmation || data.password || 'password123',
    }));

    form.post('/users', {
      preserveScroll: true,
      onSuccess: () => {
        toast.success('User created successfully');
        closeFormDialog();
        router.reload({ only: ['users', 'countries'] });
      },
      onError: (errors) => {
        const firstError = Object.values(errors)[0];
        toast.error(typeof firstError === 'string' ? firstError : 'Failed to create user');
      },
      onFinish: () => form.transform((data) => data),
    });
  };

  const handleDelete = () => {
    if (!deletingUser) return;

    setDeleteProcessing(true);
    router.delete(`/users/${deletingUser.id}`, {
      preserveScroll: true,
      onSuccess: () => {
        toast.success('User deleted successfully');
        setDeletingUser(null);
        router.reload({ only: ['users', 'countries'] });
      },
      onError: (errors) => {
        const firstError = Object.values(errors)[0];
        toast.error(typeof firstError === 'string' ? firstError : 'Failed to delete user');
      },
      onFinish: () => setDeleteProcessing(false),
    });
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Users" />

      <div className="space-y-5 p-4">
        <Card className="border-border/60 bg-gradient-to-br from-background via-background to-muted/25">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary" className="gap-1">
                  <Shield className="size-3.5" />
                  {currentUserRole || 'unknown role'}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Globe2 className="size-3.5" />
                  {currentCountryName}
                </Badge>
              </div>
              <CardTitle className="text-2xl">User Management</CardTitle>
              <CardDescription>
                Create and update staff accounts with the right role and country access.
              </CardDescription>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
              <div className="flex gap-2 sm:w-80">
                <Input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                  placeholder="Search by name, email, role, or country"
                  className="flex-1"
                />
                <Button onClick={doSearch} variant="secondary" className="gap-2 shrink-0">
                  <Search className="size-4" />
                  Search
                </Button>
              </div>
              {canManageUsers ? (
                <Button onClick={openCreate} className="gap-2">
                  <Plus className="size-4" />
                  Create User
                </Button>
              ) : null}
            </div>
          </CardHeader>
        </Card>

        {users.data.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex min-h-48 items-center justify-center text-muted-foreground">
              No users found for the current search.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 auto-rows-min grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            {users.data.map((user) => (
              <Card
                key={user.id}
                className="flex flex-col justify-between border-border/60 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
              >
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 overflow-hidden">
                      <CardTitle className="truncate text-base">{user.name}</CardTitle>
                      <CardDescription className="truncate">{user.email}</CardDescription>
                    </div>
                    <div className="rounded-xl bg-muted p-2 text-muted-foreground">
                      <UserRound className="size-4" />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{user.roles || 'admin'}</Badge>
                    <Badge variant="outline">{user.country?.name || 'No country'}</Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div><span className="font-medium text-foreground">Username:</span> {user.username || '-'}</div>
                  <div><span className="font-medium text-foreground">Store:</span> {user.store_name || '-'}</div>
                  <div><span className="font-medium text-foreground">Phone:</span> {user.store_phone || '-'}</div>
                  <div><span className="font-medium text-foreground">Created:</span> {new Date(user.created_at).toLocaleDateString()}</div>
                </CardContent>

                {canManageUsers ? (
                  <div className="flex gap-2 p-4 pt-0">
                    <Button className="flex-1 gap-2" variant="outline" onClick={() => openEdit(user)}>
                      <Edit className="size-4" />
                      Edit
                    </Button>
                    <Button variant="destructive" size="icon" onClick={() => setDeletingUser(user)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}

        {users.last_page > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(users.current_page - 1) * users.per_page + 1}&ndash;{Math.min(users.current_page * users.per_page, users.total)} of {users.total}
            </p>
            <Pagination>
              <PaginationContent>
                {users.links.map((link, i) => {
                  if (link.url === null) return null;
                  const url = new URL(link.url);
                  const page = url.searchParams.get('page');
                  return (
                    <PaginationItem key={i}>
                      <PaginationLink
                        href={link.url}
                        isActive={link.active}
                        onClick={(e) => {
                          e.preventDefault();
                          router.get('/users', { search: filter, page: Number(page) }, { preserveState: true, replace: true });
                        }}
                        dangerouslySetInnerHTML={{ __html: link.label }}
                      />
                    </PaginationItem>
                  );
                })}
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>

      <Dialog open={creatingUser || !!editingUser} onOpenChange={(open) => (!open ? closeFormDialog() : undefined)}>
        <DialogContent className="max-w-2xl overflow-y-auto max-h-[90vh] sm:max-h-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit User' : 'Create User'}</DialogTitle>
            <DialogDescription>
              Set the login details, role, and country access for this user.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} />
              <FieldError message={form.errors.name} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={form.data.username} onChange={(e) => form.setData('username', e.target.value)} />
              <FieldError message={form.errors.username} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.data.email} onChange={(e) => form.setData('email', e.target.value)} />
              <FieldError message={form.errors.email} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  id="email_verified"
                  type="checkbox"
                  className="size-4 rounded border-input accent-primary"
                  checked={form.data.email_verified}
                  onChange={(e) => {
                    form.setData('email_verified', e.target.checked);
                    if (e.target.checked && !form.data.email_verified_at) {
                      form.setData('email_verified_at', new Date().toISOString().slice(0, 16));
                    }
                  }}
                />
                <Label htmlFor="email_verified">Email verified</Label>
              </div>
              {form.data.email_verified && (
                <Input
                  type="datetime-local"
                  value={form.data.email_verified_at ? form.data.email_verified_at.slice(0, 16) : ''}
                  onChange={(e) => form.setData('email_verified_at', e.target.value)}
                />
              )}
              <FieldError message={form.errors.email_verified_at} />
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={form.data.roles} onValueChange={(value) => form.setData('roles', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={form.errors.roles} />
            </div>

            <div className="space-y-2">
              <Label>Country</Label>
              <Select
                value={form.data.country_id}
                onValueChange={(value) => form.setData('country_id', value)}
                disabled={!canChooseCountry && countries.length <= 1}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((country) => (
                    <SelectItem key={country.id} value={String(country.id)}>
                      {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={form.errors.country_id} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="store_name">Store Name</Label>
              <Input id="store_name" value={form.data.store_name} onChange={(e) => form.setData('store_name', e.target.value)} />
              <FieldError message={form.errors.store_name} />
            </div>

            <div className="space-y-2">
              <Label>Store Address (Country)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn('w-full justify-between', !form.data.store_address && 'text-muted-foreground')}
                  >
                    {form.data.store_address || 'Select country'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search country..." />
                    <CommandList className="max-h-64">
                      <CommandEmpty>No country found.</CommandEmpty>
                      <CommandGroup>
                        {eastAfricanCountries.map((country) => (
                          <CommandItem
                            key={country}
                            value={country}
                            onSelect={() => {
                              form.setData('store_address', form.data.store_address === country ? '' : country);
                            }}
                          >
                            <Check
                              className={cn('mr-2 h-4 w-4', form.data.store_address === country ? 'opacity-100' : 'opacity-0')}
                            />
                            {country}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <FieldError message={form.errors.store_address} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="store_phone">Store Phone</Label>
              <Input id="store_phone" value={form.data.store_phone} onChange={(e) => form.setData('store_phone', e.target.value)} />
              <FieldError message={form.errors.store_phone} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="store_email">Store Email</Label>
              <Input id="store_email" type="email" value={form.data.store_email} onChange={(e) => form.setData('store_email', e.target.value)} />
              <FieldError message={form.errors.store_email} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="photo">Photo URL</Label>
              <Input id="photo" value={form.data.photo} onChange={(e) => form.setData('photo', e.target.value)} />
              <FieldError message={form.errors.photo} />
            </div>

            <>
              <>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id={editingUser ? `edit-password-${editingUser.id}` : 'create-password'}
                      name={editingUser ? `edit_password_${editingUser.id}` : 'new_password'}
                      type={showPassword ? 'text' : 'password'}
                      value={form.data.password}
                      onChange={(e) => form.setData('password', e.target.value)}
                      placeholder={editingUser ? 'Leave blank to keep current password' : 'Defaults to password123 if left empty'}
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <FieldError message={form.errors.password} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password_confirmation">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id={editingUser ? `edit-password-confirmation-${editingUser.id}` : 'create-password-confirmation'}
                      name={editingUser ? `edit_password_confirmation_${editingUser.id}` : 'new_password_confirmation'}
                      type={showPasswordConfirmation ? 'text' : 'password'}
                      value={form.data.password_confirmation}
                      onChange={(e) => form.setData('password_confirmation', e.target.value)}
                      placeholder="Repeat password"
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordConfirmation((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showPasswordConfirmation ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <FieldError message={form.errors.password_confirmation} />
                </div>
              </>
            </>
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={closeFormDialog}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={form.processing}>
              {form.processing ? <Loader2 className="size-4 animate-spin" /> : null}
              {form.processing ? 'Saving...' : editingUser ? 'Save Changes' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingUser} onOpenChange={(open) => (!open ? setDeletingUser(null) : undefined)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              This will permanently remove <strong>{deletingUser?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setDeletingUser(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteProcessing}>
              {deleteProcessing ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
