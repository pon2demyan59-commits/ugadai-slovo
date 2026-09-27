const YandexGames = {
  sdk: null,
  ready: false,

  async init() {
    if (!window.YaGames) {
      return null;
    }

    try {
      this.sdk = await window.YaGames.init();
      this.ready = true;
      return this.sdk;
    } catch (error) {
      this.sdk = null;
      this.ready = false;
      return null;
    }
  },

  gameReady() {
    if (this.sdk?.features?.LoadingAPI?.ready) {
      this.sdk.features.LoadingAPI.ready();
    }
  },

  showFullscreenAd(callback) {
    if (!this.sdk?.adv?.showFullscreenAdv) {
      callback?.(false);
      return;
    }

    this.sdk.adv.showFullscreenAdv({
      callbacks: {
        onClose: wasShown => callback?.(wasShown),
        onError: () => callback?.(false)
      }
    });
  },

  showRewardedAd(onReward, onClose) {
    if (!this.sdk?.adv?.showRewardedVideo) {
      onReward?.();
      onClose?.(false);
      return;
    }

    let rewarded = false;
    this.sdk.adv.showRewardedVideo({
      callbacks: {
        onRewarded: () => {
          rewarded = true;
          onReward?.();
        },
        onClose: wasShown => onClose?.(wasShown, rewarded),
        onError: () => onClose?.(false, rewarded)
      }
    });
  }
};
