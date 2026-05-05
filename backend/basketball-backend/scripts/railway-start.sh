#!/usr/bin/env bash
set -e

php artisan optimize:clear

if [ "${DB_CONNECTION:-}" = "mysql" ]; then
  echo "Waiting for MySQL at ${DB_HOST:-127.0.0.1}:${DB_PORT:-3306}..."
  php -r '
    $host = getenv("DB_HOST") ?: "127.0.0.1";
    $port = (int) (getenv("DB_PORT") ?: 3306);
    $timeout = 3;
    $attempts = 60;

    for ($attempt = 1; $attempt <= $attempts; $attempt++) {
        $socket = @fsockopen($host, $port, $errno, $errstr, $timeout);
        if ($socket) {
            fclose($socket);
            fwrite(STDOUT, "MySQL is reachable.\n");
            exit(0);
        }

        fwrite(STDOUT, "MySQL not ready ({$attempt}/{$attempts}): {$errstr}\n");
        sleep(2);
    }

    fwrite(STDERR, "MySQL did not become reachable in time.\n");
    exit(1);
  '
fi

php artisan migrate --force
php artisan serve --host=0.0.0.0 --port="${PORT}"
