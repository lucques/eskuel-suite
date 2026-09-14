import type { ImageMediaType } from '../../game/image';
import styles from './Base64Image.module.css';

export function Base64Image({ base64string, mediaType }: {
    base64string: string,
    mediaType: ImageMediaType,
}) {
    return (
        <div className={styles.container}>
            <img
                className={styles.image}
                src={`data:${mediaType};base64,${base64string}`}
                alt=''
            />
        </div>
    );
}
