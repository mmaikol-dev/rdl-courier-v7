<?php

header('Content-Type: application/json');

echo json_encode([
    'getenv_APP_KEY' => getenv('APP_KEY') ? 'set' : 'missing',
    '_ENV_APP_KEY' => isset($_ENV['APP_KEY']) && $_ENV['APP_KEY'] !== '' ? 'set' : 'missing',
    '_SERVER_APP_KEY' => isset($_SERVER['APP_KEY']) && $_SERVER['APP_KEY'] !== '' ? 'set' : 'missing',
], JSON_PRETTY_PRINT);
