
import React, { useEffect, useRef } from 'react';

interface UniversalVideoPlayerProps {
    url: string;
    autoPlay?: boolean;
    onEnded?: () => void;
    className?: string;
}

export const UniversalVideoPlayer: React.FC<UniversalVideoPlayerProps> = ({ url, autoPlay, onEnded, className }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

    useEffect(() => {
        if (!isYouTube && videoRef.current && autoPlay) {
            // Încercăm pornirea directă. Browserele de obicei permit asta după interacțiunea de tip 'tap' pe monedă.
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn("Autoplay inițial blocat. Reîncercăm cu muted=true ca fallback.");
                    if (videoRef.current) {
                        videoRef.current.muted = true;
                        videoRef.current.play().catch(e => console.error("Autoplay eșuat definitiv", e));
                    }
                });
            }
        }
    }, [url, autoPlay, isYouTube]);
    
    if (isYouTube) {
        let videoId = '';
        if (url.includes('v=')) {
            videoId = url.split('v=')[1].split('&')[0];
        } else if (url.includes('youtu.be/')) {
            videoId = url.split('youtu.be/')[1].split('?')[0];
        } else {
            videoId = url.split('/').pop() || '';
        }

        // Adăugăm parametri pentru autoplay, mute=0 (încercăm cu sunet), playsinline și permitere API
        // Parametrul 'autoplay=1' funcționează de obicei doar dacă există interacțiune prealabilă sau dacă video e muted=1.
        // Aici mizăm pe tap-ul utilizatorului pe monedă.
        const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&rel=0&playsinline=1&enablejsapi=1&modestbranding=1`;
        
        return (
            <div className={`relative overflow-hidden ${className}`}>
                <iframe
                    className="absolute inset-0 w-full h-full"
                    src={embedUrl}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                    frameBorder="0"
                    title="YouTube Video Player"
                />
            </div>
        );
    }

    return (
        <video
            ref={videoRef}
            className={className}
            src={url}
            autoPlay={autoPlay}
            controls={false}
            onEnded={onEnded}
            playsInline
            muted={false} // Încercăm pornirea cu sunet activ
            style={{ width: '100%', height: '100%', backgroundColor: 'black', objectFit: 'contain' }}
        />
    );
};
