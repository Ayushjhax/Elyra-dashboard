declare const allPackages: readonly ['svg-3d-engine', 'animation-utils', 'animated-emoji', 'astro-example', 'babel-loader', 'bugs', 'brand', 'bundler', 'browser-bundler', 'browser-studio', 'sdk', 'claude-code-plugin', 'cli', 'cloudrun', 'agent-plugin', 'kimi-code-plugin', 'compositor-darwin-arm64', 'compositor-darwin-x64', 'compositor-linux-arm64-gnu', 'compositor-linux-arm64-musl', 'compositor-linux-x64-gnu', 'compositor-linux-x64-musl', 'compositor-win32-x64-msvc', 'core', 'create-video', 'discord-poster', 'docusaurus-plugin', 'docs', 'enable-scss', 'eslint-config', 'eslint-config-flat', 'eslint-config-internal', 'eslint-plugin', 'example-without-zod', 'example', 'fonts', 'gif', 'google-fonts', 'gsap', 'install-whisper-cpp', 'it-tests', 'react18-tests', 'lambda-go-example', 'lambda-go', 'lambda-php', 'lambda-ruby', 'lambda-python', 'lambda', 'lambda-client', 'layout-utils', 'rounded-text-box', 'licensing', 'lottie', 'media-utils', 'motion-blur', 'noise', 'paths', 'player-a11y', 'player-example', 'player', 'preload', 'renderer', 'rive', 'shapes', 'skia', 'promo-pages', 'streaming', 'skills', 'skills-evals', 'codemods', 'studio-server', 'studio-shared', 'studio', 'tailwind', 'tailwind-v4', 'timeline-utils', 'test-utils', 'three', 'transitions', 'media-parser', 'zod-types', 'zod-types-v3', 'webcodecs', 'convert', 'captions', 'openai-whisper', 'elevenlabs', 'compositor', 'example-videos', 'whisper-web', 'whisper-webgpu', 'video-matting', 'media', 'remotion-media', 'web-renderer', 'design', 'studio-protocol', 'light-leaks', 'mac-cursors', 'maptiler', 'rough-notation', 'starburst', 'vercel', 'sfx', 'effects'];
export type Pkgs = (typeof allPackages)[number];
export declare const packages: ("agent-plugin" | "animated-emoji" | "animation-utils" | "astro-example" | "babel-loader" | "brand" | "browser-bundler" | "browser-studio" | "bugs" | "bundler" | "captions" | "claude-code-plugin" | "cli" | "cloudrun" | "codemods" | "compositor" | "compositor-darwin-arm64" | "compositor-darwin-x64" | "compositor-linux-arm64-gnu" | "compositor-linux-arm64-musl" | "compositor-linux-x64-gnu" | "compositor-linux-x64-musl" | "compositor-win32-x64-msvc" | "convert" | "core" | "create-video" | "design" | "discord-poster" | "docs" | "docusaurus-plugin" | "effects" | "elevenlabs" | "enable-scss" | "eslint-config" | "eslint-config-flat" | "eslint-config-internal" | "eslint-plugin" | "example" | "example-videos" | "example-without-zod" | "fonts" | "gif" | "google-fonts" | "gsap" | "install-whisper-cpp" | "it-tests" | "kimi-code-plugin" | "lambda" | "lambda-client" | "lambda-go" | "lambda-go-example" | "lambda-php" | "lambda-python" | "lambda-ruby" | "layout-utils" | "licensing" | "light-leaks" | "lottie" | "mac-cursors" | "maptiler" | "media" | "media-parser" | "media-utils" | "motion-blur" | "noise" | "openai-whisper" | "paths" | "player" | "player-a11y" | "player-example" | "preload" | "promo-pages" | "react18-tests" | "remotion-media" | "renderer" | "rive" | "rough-notation" | "rounded-text-box" | "sdk" | "sfx" | "shapes" | "skia" | "skills" | "skills-evals" | "starburst" | "streaming" | "studio" | "studio-protocol" | "studio-server" | "studio-shared" | "svg-3d-engine" | "tailwind" | "tailwind-v4" | "test-utils" | "three" | "timeline-utils" | "transitions" | "vercel" | "video-matting" | "web-renderer" | "webcodecs" | "whisper-web" | "whisper-webgpu" | "zod-types" | "zod-types-v3")[];
export type ExtraPackage = {
    name: string;
    version: string;
    description: string;
    docsUrl: string;
    versionDocsUrl: string;
};
export declare const extraPackages: ExtraPackage[];
export declare const descriptions: {
    [key in Pkgs]: string | null;
};
export declare const installableMap: {
    [key in Pkgs]: boolean;
};
export declare const apiDocs: {
    [key in Pkgs]: string | null;
};
export {};
