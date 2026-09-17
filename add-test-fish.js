// Helper script to add test fish to the aquarium
(async function addTestFish() {
  // Load fish images and convert to data URLs
  async function imageToDataUrl(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  const fishList = [
    { kind: 'fish', src: '/fish/striped.png', name: 'Полосатик 1' },
    { kind: 'fish', src: '/fish/big_nose.png', name: 'Носатик 1' },
    { kind: 'fish', src: '/fish/striped.png', name: 'Полосатик 2' },
    { kind: 'whale', src: '/fish/whale.png', name: 'Кит' },
    { kind: 'shark', src: '/fish/shark.png', name: 'Акула' },
    { kind: 'dolphin', src: '/fish/dolphin.jpg', name: 'Дельфин' },
    { kind: 'swordfish', src: '/fish/swordfish.png', name: 'Рыба-меч' },
    { kind: 'fish', src: '/fish/big_nose.png', name: 'Носатик 2' },
  ];

  console.log('Loading fish images...');
  
  for (const fishDef of fishList) {
    try {
      console.log(`Loading ${fishDef.name}...`);
      const image = await imageToDataUrl(fishDef.src);
      
      const msg = {
        type: 'addFish',
        fish: {
          id: crypto.randomUUID(),
          image: image,
          kind: fishDef.kind
        }
      };
      
      const bc = new BroadcastChannel('aquarium-home');
      bc.postMessage(msg);
      bc.close();
      
      console.log(`Added ${fishDef.name} (${fishDef.kind})`);
      
      // Small delay between fish
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.error(`Failed to load ${fishDef.name}:`, err);
    }
  }
  
  console.log(`Successfully added ${fishList.length} fish!`);
})();
