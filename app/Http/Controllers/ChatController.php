<?php

namespace App\Http\Controllers;

use App\Models\Chat;
use App\Models\Whatsapp;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;



class ChatController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    private function normalizePhoneNumber($phone): string
    {
        $phone = preg_replace('/\D/', '', $phone);

        if (substr($phone, 0, 1) === '0') {
            $phone = substr($phone, 1);
        }

        if (substr($phone, 0, 3) !== '254') {
            $phone = '254' . $phone;
        }

        return '+' . $phone;
    }

    private function countryFilter($query): void
    {
        /** @var User|null $user */
        $user = Auth::user();

        if (! $user || $user->hasGlobalCountryAccess()) {
            return;
        }

        $storeAddress = $user->store_address;

        if ($storeAddress) {
            $query->where(function ($q) use ($storeAddress) {
                $q->whereRaw('LOWER(store_name) = ?', [strtolower(trim($storeAddress))])
                  ->orWhereNull('store_name')
                  ->orWhere('store_name', '');
            });
        }
    }

    private function groupAndSortChats($rawChats): array
    {
        $grouped = [];

        foreach ($rawChats as $chat) {
            $normalized = $this->normalizePhoneNumber($chat->to);

            if (!isset($grouped[$normalized])) {
                $grouped[$normalized] = [
                    'phone' => $normalized,
                    'client_name' => $chat->client_name,
                    'store_name' => $chat->store_name,
                    'cc_agents' => $chat->cc_agents,
                    'messages' => [],
                    'latest_at' => $chat->created_at,
                ];
            }

            $grouped[$normalized]['messages'][] = $chat;

            if ($chat->created_at > $grouped[$normalized]['latest_at']) {
                $grouped[$normalized]['latest_at'] = $chat->created_at;
            }

            if (empty($grouped[$normalized]['cc_agents']) && !empty($chat->cc_agents)) {
                $grouped[$normalized]['cc_agents'] = $chat->cc_agents;
            }
        }

        return collect($grouped)->sortByDesc('latest_at')->values()->toArray();
    }

    public function index(Request $request)
    {
        $perPage = $request->get('per_page', 50);
        $currentPage = $request->get('page', 1);

        $query = Chat::where('created_at', '>=', now()->subDays(90));
        $this->countryFilter($query);
        $rawChats = $query->orderBy('created_at', 'asc')->get();

        $sortedConversations = $this->groupAndSortChats($rawChats);

        $total = count($sortedConversations);
        $offset = ($currentPage - 1) * $perPage;
        $paginatedConversations = array_slice($sortedConversations, $offset, $perPage);

        $pagination = [
            'current_page' => (int) $currentPage,
            'per_page' => (int) $perPage,
            'total' => $total,
            'last_page' => (int) ceil($total / $perPage),
            'has_more_pages' => $currentPage < ceil($total / $perPage),
        ];

        return Inertia::render('whatsapp/index', [
            'conversations' => $paginatedConversations,
            'pagination' => $pagination,
        ]);
    }

    /**
     * Poll for new/updated messages since a given timestamp.
     * GET /api/whatsapp/conversations?since=2026-07-20T10:00:00
     */
    public function getConversations(Request $request)
    {
        $since = $request->get('since');
        $search = $request->get('search');
        $perPage = (int) $request->get('per_page', 15);
        $currentPage = (int) $request->get('page', 1);

        $query = Chat::orderBy('created_at', 'asc');

        if ($since) {
            $query->where('updated_at', '>', $since);
        }

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('client_name', 'like', "%{$search}%")
                  ->orWhere('message', 'like', "%{$search}%")
                  ->orWhere('to', 'like', "%{$search}%");
            });
        }

        $this->countryFilter($query);
        $query->where('created_at', '>=', now()->subDays(90));
        $rawChats = $query->get();

        $sortedConversations = $this->groupAndSortChats($rawChats);

        $total = count($sortedConversations);
        $offset = ($currentPage - 1) * $perPage;
        $paginatedConversations = array_slice($sortedConversations, $offset, $perPage);

        return response()->json([
            'conversations' => $paginatedConversations,
            'pagination' => [
                'current_page' => $currentPage,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => (int) ceil($total / $perPage),
                'has_more_pages' => $currentPage < ceil($total / $perPage),
            ],
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        //
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        //
    }

    public function show($phone)
    {
        $normalized = $this->normalizePhoneNumber($phone);

        $query = Chat::where('to', $normalized);
        $this->countryFilter($query);
        $messages = $query->orderBy('created_at', 'asc')->get();

        return response()->json($messages);
    }


    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Chat $chat)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     */
    public function updateStatus(Request $request, $phone)
    {
        $request->validate([
            'type' => 'required|in:0,1',
        ]);

        // Update all messages for this phone number
        Whatsapp::where('to', $phone)->update([
            'type' => $request->type,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Chat updated successfully',
        ]);
    }

    

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Chat $chat)
    {
        //
    }
}
