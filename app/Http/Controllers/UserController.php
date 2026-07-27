<?php

namespace App\Http\Controllers;

use App\Models\Country;
use App\Models\User;
use App\Support\CountryAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Inertia\Inertia;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules;

class UserController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $currentUser = $request->user();
        $search = trim((string) $request->string('search'));

        $query = CountryAccess::scopeUsers(
            User::query()->with('country'),
            $currentUser
        );

        if ($search !== '') {
            $like = "%{$search}%";
            $query->where(function ($q) use ($like) {
                $q->where('name', 'like', $like)
                    ->orWhere('username', 'like', $like)
                    ->orWhere('email', 'like', $like)
                    ->orWhere('roles', 'like', $like);
            });
        }

        $users = $query->orderBy('created_at', 'desc')
            ->paginate(20)
            ->withQueryString()
            ->through(function (User $user) {
                return [
                    'id' => $user->id,
                    'username' => $user->username,
                    'name' => $user->name,
                    'email' => $user->email,
                    'email_verified_at' => $user->email_verified_at instanceof \Carbon\Carbon
                        ? $user->email_verified_at->format('Y-m-d H:i:s')
                        : $user->email_verified_at,
                    'store_name' => $user->store_name,
                    'store_address' => $user->store_address,
                    'store_phone' => $user->store_phone,
                    'store_email' => $user->store_email,
                    'roles' => $user->roles,
                    'country_id' => $user->country_id,
                    'country' => $user->country ? ['id' => $user->country->id, 'name' => $user->country->name] : null,
                    'photo' => $user->photo,
                    'created_at' => $user->created_at->format('Y-m-d H:i:s'),
                    'updated_at' => $user->updated_at->format('Y-m-d H:i:s'),
                ];
            });

        return Inertia::render('users/index', [
            'users' => $users,
            'search' => $search,
            'countries' => CountryAccess::hasGlobalAccess($currentUser)
                ? Country::query()->orderBy('name')->get(['id', 'name'])
                : Country::query()
                    ->whereKey($currentUser?->country_id)
                    ->orderBy('name')
                    ->get(['id', 'name']),
        ]);
    }
    

    /**
     * Store a newly created user in storage.
     */


    public function store(Request $request)
{
    $request->validate([
        'name' => 'required|string|max:255',
        'email' => 'required|string|email|max:255|unique:users,email',
        'username' => 'nullable|string|max:255|unique:users,username',
        'password' => ['required', 'confirmed', Rules\Password::defaults()],
        'store_name' => 'nullable|string|max:255',
        'store_address' => 'nullable|string|max:255',
        'store_phone' => 'nullable|string|max:50',
        'store_email' => 'nullable|string|email|max:255',
        'roles' => ['nullable', 'string', 'in:admin,g.o.d,superadmin,operations,finance,callcenter1,merchant,agent,warehouse'],
        'country_id' => 'nullable|integer|exists:countries,id',
        'photo' => 'nullable|string|max:255',
        'email_verified_at' => 'nullable|date',
    ]);

    $currentUser = $request->user();
    $countryId = CountryAccess::hasGlobalAccess($currentUser)
        ? $request->country_id
        : $currentUser?->country_id;

    User::create([
        'name' => $request->name,
        'email' => $request->email,
        'username' => $request->username,
        'password' => Hash::make($request->password),
        'store_name' => $request->store_name,
        'store_address' => $request->store_address,
        'store_phone' => $request->store_phone,
        'store_email' => $request->store_email,
        'roles' => $request->roles ?? 'admin',
        'country_id' => $countryId,
        'photo' => $request->photo,
        'email_verified_at' => $request->email_verified_at,
    ]);

    // Send back the new user data for Inertia
    return redirect()->back()->with('success', 'user created successfully.');
}
    

    /**
     * Update the specified user.
     */
    public function update(Request $request, User $user)
    {
        $currentUser = $request->user();
        abort_unless(
            CountryAccess::hasGlobalAccess($currentUser) || $user->country_id === $currentUser?->country_id,
            403
        );

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users,email,' . $user->id,
            'username' => 'nullable|string|max:255|unique:users,username,' . $user->id,
            'password' => ['nullable', Rules\Password::defaults()],
            'password_confirmation' => ['nullable', 'string'],
            'store_name' => 'nullable|string|max:255',
            'store_address' => 'nullable|string|max:255',
            'store_phone' => 'nullable|string|max:50',
            'store_email' => 'nullable|string|email|max:255',
            'roles' => 'nullable|string|in:admin,g.o.d,superadmin,operations,finance,callcenter1,merchant,agent,warehouse',
            'country_id' => 'nullable|integer|exists:countries,id',
            'photo' => 'nullable|string|max:255',
            'email_verified_at' => 'nullable|date',
        ]);

        $validator->after(function ($validator) use ($request): void {
            $password = (string) $request->input('password', '');
            $confirmation = (string) $request->input('password_confirmation', '');

            if ($password !== '' && $password !== $confirmation) {
                $validator->errors()->add('password_confirmation', 'The password confirmation does not match.');
            }
        });

        $validator->validate();

        $countryId = CountryAccess::hasGlobalAccess($currentUser)
            ? $request->country_id
            : $user->country_id;

        $payload = [
            'name' => $request->name,
            'email' => $request->email,
            'username' => $request->username,
            'store_name' => $request->store_name,
            'store_address' => $request->store_address,
            'store_phone' => $request->store_phone,
            'store_email' => $request->store_email,
            'roles' => $request->roles ?? $user->roles,
            'country_id' => $countryId,
            'photo' => $request->photo,
            'email_verified_at' => $request->email_verified_at,
        ];

        if ($request->filled('password')) {
            $payload['password'] = Hash::make($request->password);
        }

        $user->update($payload);

        return redirect()->back()->with('success', 'User updated successfully.');
    }

    /**
     * Remove the specified user.
     */
    public function destroy(User $user)
    {
        $currentUser = request()->user();
        abort_unless(
            CountryAccess::hasGlobalAccess($currentUser) || $user->country_id === $currentUser?->country_id,
            403
        );

        $user->delete();
        return redirect()->back()->with('success', 'User deleted successfully.');
    }
}
