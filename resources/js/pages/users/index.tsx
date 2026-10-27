"use client";

import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Deferred, Head, router, useForm, usePage } from '@inertiajs/react';
import {
  Card,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, ChevronsUpDown, Edit, Eye, EyeOff, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import * as React from 'react';

const breadcrumbs: BreadcrumbItem[] = [
  { title: 'Dashboard', href: '/dashboard' },
  { title: 'Users', href: '/users' },
];

const africanCountries = [
  'Algeria',
  'Angola',
  'Benin',
  'Botswana',
  'Burkina Faso',
  'Burundi',
  'Cabo Verde',
  'Cameroon',
  'Central African Republic',
  'Chad',
  'Comoros',
  'Democratic Republic of the Congo',
  'Republic of the Congo',
  "Côte d'Ivoire",
  'Djibouti',
  'Egypt',
  'Equatorial Guinea',
  'Eritrea',
  'Eswatini',
  'Ethiopia',
  'Gabon',
  'Gambia',
  'Ghana',
  'Guinea',
  'Guinea-Bissau',
  'Kenya',
  'Lesotho',
  'Liberia',
  'Libya',
  'Madagascar',
  'Malawi',
  'Mali',
  'Mauritania',
  'Mauritius',
  'Morocco',
  'Mozambique',
  'Namibia',
  'Niger',
  'Nigeria',
  'Rwanda',
  'São Tomé and Príncipe',
  'Senegal',
  'Seychelles',
  'Sierra Leone',
  'Somalia',
  'South Africa',
  'South Sudan',
  'Sudan',
  'Tanzania',
  'Togo',
  'Tunisia',
  'Uganda',
  'Zambia',
  'Zimbabwe',
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
  roleFilter: string;
  countryFilter: string;
  countries: CountryOption[];
  auth: {
    user: {
      roles?: string;
      country?: { id: number; name: string } | null;
    };
  };
}

const EMPTY_USERS: PaginatedUsers = { data: [], current_page: 1, last_page: 1, per_page: 20, total: 0, links: [] };

function UsersTableSkeleton() {
  return <div className="space-y-3 p-4" role="status" aria-label="Loading users" aria-live="polite">
    <div className="grid grid-cols-3 gap-3 border-b pb-3 sm:grid-cols-7">{Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="h-4 w-full" />)}</div>
    {Array.from({ length: 7 }).map((_, row) => <div key={row} className="grid grid-cols-3 gap-3 border-b py-3 last:border-0 sm:grid-cols-7">{Array.from({ length: 7 }).map((__, column) => <Skeleton key={column} className="h-5 w-full" />)}</div>)}
  </div>;
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
  const pageProps = usePage<UsersPageProps>().props;
  const users = pageProps.users ?? EMPTY_USERS;
  const { search, roleFilter, countryFilter, countries, auth } = pageProps;
  const currentUserRole = auth?.user?.roles ?? '';
  const canManageUsers = !['operations', 'finance', 'callcenter1', ''].includes(currentUserRole);
  const canChooseCountry = currentUserRole?.toLowerCase() === 'g.o.d';

  const [filter, setFilter] = React.useState(search ?? '');
  const [selectedRole, setSelectedRole] = React.useState(roleFilter ?? '');
  const [selectedCountry, setSelectedCountry] = React.useState(countryFilter ?? '');
  const [editingUser, setEditingUser] = React.useState<UserRecord | null>(null);
  const [creatingUser, setCreatingUser] = React.useState(false);
  const [deletingUser, setDeletingUser] = React.useState<UserRecord | null>(null);
  const [deleteProcessing, setDeleteProcessing] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = React.useState(false);

  const form = useForm<UserFormData>(emptyForm);

  const doSearch = (nextRole = selectedRole, nextCountry = selectedCountry) => {
    router.get('/users', {
      search: filter,
      role: nextRole,
      country_id: nextCountry,
    }, { preserveState: true, replace: true });
  };

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

      <div className="space-y-4 px-4 py-2">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage accounts, roles, and country access.</p>
          </div>
          {canManageUsers ? (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" />Create user
            </Button>
          ) : null}
        </div>

        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="flex flex-col gap-1 border-b px-2 py-0.5 md:flex-row md:items-center md:justify-start">
            <div className="flex shrink-0 items-center gap-1.5">
              <CardTitle className="text-sm">Accounts</CardTitle>
              <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">{users.total}</Badge>
            </div>
            <div className="grid w-full gap-1.5 md:w-auto md:grid-cols-[220px_130px_140px_auto]">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && doSearch()}
                  placeholder="Search name or email"
                  className="h-8 pl-9 text-xs"
                />
              </div>
              <Select value={selectedRole || 'all'} onValueChange={(value) => {
                const nextRole = value === 'all' ? '' : value;
                setSelectedRole(nextRole);
                doSearch(nextRole, selectedCountry);
              }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All roles" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {roleOptions.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={selectedCountry || 'all'} onValueChange={(value) => {
                const nextCountry = value === 'all' ? '' : value;
                setSelectedCountry(nextCountry);
                doSearch(selectedRole, nextCountry);
              }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All countries" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All countries</SelectItem>
                  {countries.map((country) => <SelectItem key={country.id} value={String(country.id)}>{country.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={() => doSearch()} variant="secondary" className="h-8 gap-1.5 px-2.5 text-xs">
                <Search className="size-4" /><span className="hidden sm:inline">Search</span>
              </Button>
            </div>
          </CardHeader>

          <Deferred data="users" fallback={<UsersTableSkeleton />}>
            {() => <>
              {users.data.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No users found for the current search.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[850px]">
                    <TableHeader>
                      <TableRow className="h-8 bg-muted/30 hover:bg-muted/30">
                        <TableHead className="h-8 pl-2">User</TableHead>
                        <TableHead className="h-8">Role</TableHead>
                        <TableHead className="h-8">Country</TableHead>
                        <TableHead className="h-8">Store</TableHead>
                        <TableHead className="h-8">Phone</TableHead>
                        <TableHead className="h-8">Joined</TableHead>
                        {canManageUsers ? <TableHead className="h-8 pr-2 text-right">Actions</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.data.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="px-2 py-1">
                            <div className="flex min-w-48 items-center gap-2">
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                                {user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">{user.name}</p>
                                <p className="truncate text-xs text-muted-foreground">{user.username ? `@${user.username} · ` : ''}{user.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-2 py-1"><Badge variant="secondary" className="h-5 px-1.5 text-[11px] capitalize">{user.roles || 'admin'}</Badge></TableCell>
                          <TableCell className="px-2 py-1 text-sm">{user.country?.name || '—'}</TableCell>
                          <TableCell className="max-w-40 truncate px-2 py-1 text-sm" title={user.store_name ?? undefined}>{user.store_name || '—'}</TableCell>
                          <TableCell className="whitespace-nowrap px-2 py-1 text-sm">{user.store_phone || '—'}</TableCell>
                          <TableCell className="whitespace-nowrap px-2 py-1 text-sm text-muted-foreground">{new Date(user.created_at).toLocaleDateString()}</TableCell>
                          {canManageUsers ? (
                            <TableCell className="px-2 py-1">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => openEdit(user)}>
                                  <Edit className="size-3.5" />Edit
                                </Button>
                                <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" aria-label={`Delete ${user.name}`} onClick={() => setDeletingUser(user)}>
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {users.last_page > 1 && (
                <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {(users.current_page - 1) * users.per_page + 1}&ndash;{Math.min(users.current_page * users.per_page, users.total)} of {users.total}
                  </p>
                  <Pagination>
                    <PaginationContent>
                      {users.links.map((link, index) => {
                        if (link.url === null) return null;
                        const url = new URL(link.url);
                        const page = url.searchParams.get('page');
                        return (
                          <PaginationItem key={index}>
                            <PaginationLink
                              href={link.url}
                              isActive={link.active}
                              onClick={(event) => {
                                event.preventDefault();
                                router.get('/users', { search: filter, role: selectedRole, country_id: selectedCountry, page: Number(page) }, { preserveState: true, replace: true });
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
            </>}
          </Deferred>
        </Card>
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
                        {africanCountries.map((country) => (
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
