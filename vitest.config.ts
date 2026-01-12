import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

export default defineConfig({
    test: {
        // Use globals (describe, it, expect) without imports
        globals: true,

        // Longer timeout for integration tests (HA WebSocket can be slow)
        testTimeout: 30000,
        hookTimeout: 30000,

        // Run tests sequentially (we're doing real HA operations)
        sequence: {
            concurrent: false,
        },

        // Include integration tests
        include: ['src/test/**/*.integration.test.ts', 'src/test/**/*.test.ts'],

        // Environment
        environment: 'node',

        // TypeScript support via ts-node
        typecheck: {
            enabled: false,
        },
    },
});
