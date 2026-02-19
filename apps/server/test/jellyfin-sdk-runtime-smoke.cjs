(async () => {
  try {
    const sdkModule = await import('@jellyfin/sdk');
    const utilsApiModule = await import(
      '@jellyfin/sdk/lib/utils/api/index.js'
    );

    if (typeof sdkModule.Jellyfin !== 'function') {
      throw new Error('Expected Jellyfin export to be a function');
    }

    if (typeof utilsApiModule.getUserApi !== 'function') {
      throw new Error('Expected getUserApi export to be a function');
    }

    console.log('Jellyfin SDK runtime import smoke check passed');
  } catch (error) {
    console.error('Jellyfin SDK runtime import smoke check failed');
    console.error(error);
    process.exit(1);
  }
})();
