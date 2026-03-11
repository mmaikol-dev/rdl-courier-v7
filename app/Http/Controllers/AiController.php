<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
use Inertia\Inertia;
use Illuminate\Http\Request;

class AiController extends Controller
{
    private $ollamaUrl = "http://185.197.195.22:11434/api/generate";
    private $model     = "qwen2.5:1.5b";

    public function index()
    {
        return Inertia::render('ai/index');
    }

    public function ask(Request $request)
    {
        $message = $request->input('message');

        if (!$message) {
            return response()->json(['reply' => 'No message provided.'], 400);
        }

        try {
            Log::info("AI ASK: User message", ['message' => $message]);

            // Call Ollama API with optimization
            $response = Http::timeout(120)->post($this->ollamaUrl, [
                "model" => $this->model,
                "prompt" => $message,
                "stream" => false,
                "options" => [
                    "num_predict" => 100,  // Limit response tokens
                    "temperature" => 0.7,
                    "top_p" => 0.9
                ]
            ]);

            if (!$response->successful()) {
                Log::error("Ollama API error", [
                    'status' => $response->status(),
                    'body'   => $response->body(),
                ]);
                return response()->json(['reply' => 'AI service error. Please try again.'], 500);
            }

            $reply = trim($response->json('response') ?? 'No response from AI.');
            
            Log::info("AI ASK: Response received", ['reply' => $reply]);

            return response()->json(['reply' => $reply]);

        } catch (\Exception $e) {
            Log::error("AI ASK: Fatal error", ['error' => $e->getMessage()]);
            return response()->json(['reply' => 'Service temporarily unavailable. Please try again.'], 500);
        }
    }
}