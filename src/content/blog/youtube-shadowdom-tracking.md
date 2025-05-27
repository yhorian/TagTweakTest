---
title: 'How to track YouTube iframes inside a Shadow DOM'
description: 'This is a guide on how to track YouTube iframes, where the iframe is not a direct child of the Shadow DOM root.'
pubDate: 'Feb 07 2025'
---

## Introduction

Can't attach the YouTube API to a shadow DOM easily but you can call it manually if you can select the iFrame.

## Selecting the iFrame

You'll need to find a way to consistently select the iFrame. When inside of a shadow root, you need to select to Parent and then access it's shadowRoot attribute. Inside of this you can make further query selector calls to ge to the iFrame.

``` js
const iframe = document.querySelector('ns-video').shadowRoot.querySelector('iframe');
const player2 = new window.YT.Player(iframe, {
    events: {
        onReady: (event) => {
            console.warn("YouTube Player Ready:", event);
        },
        onStateChange: (event) => {
            let stateMessage;

            switch (event.data) {
                case -1:
                    stateMessage = "Unstarted (-1)";
                    break;
                case 0:
                    stateMessage = "Ended (0)";
                    break;
                case 1:
                    stateMessage = "Playing (1)";
                    break;
                case 2:
                    stateMessage = "Paused (2)";
                    break;
                case 3:
                    stateMessage = "Buffering (3)";
                    break;
                case 5:
                    stateMessage = "Video Cued (5)";
                    break;
                default:
                    stateMessage = "Unknown State";
            }
            console.warn(`YouTube Player State Changed: ${stateMessage}`);
        },
        onError: (event) => {
            console.error("YouTube Player Error:", event);
        }
    }
}
)
```

``` js
function observeIframeInShadow() {
    // Select the shadow root of `ns-video`
    const nsVideo = document.querySelector('ns-video')?.shadowRoot;
    if (!nsVideo) {
        console.warn("Shadow root for ns-video not found!");
        return;
    }

    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                // Check if the added node is an iframe
                if (node.tagName === 'IFRAME') {
                    console.warn("YouTube iframe added:", node);
                }
                // Check if the added node contains an iframe as a child
                else if (node.querySelector && node.querySelector('iframe')) {
                    console.warn("Node containing an iframe added:", node.querySelector('iframe'));
                }
            });
        });
    });

    // Observe for child elements being added inside the shadow DOM
    observer.observe(nsVideo, { childList: true, subtree: true });

    console.log("Now watching for iframes inside ns-video's shadow DOM...");
}

// Start observing
observeIframeInShadow();
```