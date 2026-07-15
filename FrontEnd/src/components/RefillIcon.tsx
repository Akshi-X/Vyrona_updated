/** Refill-cycle icon (from public/refill.svg) as a tintable component: colors via
 *  currentColor / the `color` prop. The droplet wall is widened geometrically —
 *  the inner cut-out is shrunk (85%) inside a mask instead of stroking the fill. */
export default function RefillIcon({ className, color }: { className?: string; color?: string }) {
    return (
        <svg
            viewBox="0 0 148 148"
            className={className}
            style={color ? { color } : undefined}
            fill="currentColor"
            aria-hidden
        >
            <defs>
                <mask id="refill-drop-hole">
                    <rect width="148" height="148" fill="#fff" />
                    {/* hole scaled down around its center (~73.7, 74.6) → thicker droplet wall */}
                    <path
                        transform="translate(11.06 11.19) scale(0.85)"
                        fill="#000"
                        d="M74.1,36.2c-0.9,1.2-1.5,2-1.9,2.7c-4.4,6.9-9,13.6-13,20.7 c-3.7,6.7-7.1,13.6-9.8,20.7c-5.5,14.4,6.2,33.2,25.3,32.7c18.5-0.5,30-19.2,23.3-35c-3.5-8.2-7.6-16.1-12.3-23.7 C82.1,48.3,78.2,42.5,74.1,36.2z"
                    />
                </mask>
            </defs>
            <path
                stroke="currentColor"
                strokeWidth={4}
                d="M131,82.7c-3.2,2.2-6,4.1-9.1,6.2c-0.6-0.7-1.6-1.2-1.7-1.9c-0.1-0.7,0.5-1.8,1.1-2.3c3.7-2.8,7.5-5.4,11.3-8 c0.6-0.4,1.4-0.5,2.3-0.8c1,1.5,1.9,2.9,2.8,4.3c1.8,2.9,3.7,5.8,5.4,8.8c1.1,1.9,0.8,2.6-1.9,3.8c-1.9-2.9-3.9-5.9-6.2-9.4 c-0.3,1.3-0.5,2.1-0.7,2.9c-4.9,24.3-24.1,43.4-48.4,48.2C57,140.3,27.8,124.5,17,97c-1.4-3.7-2.3-7.6-3.3-11.3 c-0.2-0.6-0.4-1.4-0.2-2c0.3-0.7,0.9-1.6,1.5-1.7c0.6-0.1,1.5,0.6,1.9,1.1c0.4,0.7,0.4,1.6,0.6,2.4c4.8,24.1,24.9,42.8,49.3,45.8 c30.5,3.7,58.3-16.5,64.1-46.5C130.9,84.3,130.9,83.8,131,82.7z"
            />
            <path
                stroke="currentColor"
                strokeWidth={4}
                d="M6.9,55c1.9,2.9,3.8,5.9,6.1,9.4c0.4-1.4,0.6-2.2,0.8-3.1C20.1,35.6,36,19.1,61.9,13.6 c33.3-7.1,65.8,14.8,72.4,48.6c0,0.2,0.1,0.3,0.1,0.5c0.2,1.3,0.6,2.9-1.2,3.3c-2.1,0.5-2.1-1.4-2.5-2.7 c-5.5-24.2-20.1-39.9-44.2-45.6C54.5,10,22.8,31.5,17.1,64.1c0,0.2,0,0.3,0.1,0.8c0.6-0.3,1.2-0.5,1.7-0.8c1.9-1.3,3.9-2.7,5.8-4.1 c1.1-0.8,2.2-1,3.1,0.2c0.8,1.1,0.2,2.1-0.8,2.8c-3.8,2.7-7.6,5.5-11.5,8.2c-0.6,0.4-1.5,0.4-2.5,0.5c-2.8-4.6-5.6-9-8.2-13.5 C3.9,56.8,4.5,55.7,6.9,55z"
            />
            {/* droplet: solid outer shape at 75% size with the shrunken hole masked out */}
            <g transform="translate(18.375 18) scale(0.75)">
                <path
                    mask="url(#refill-drop-hole)"
                    d="M74.8,31.4c2.9,4.3,5.6,8.1,8.2,12.1c6.6,10.2,12.7,20.5,17.5,31.7c7.1,16.4-0.9,30.6-11,36.6 c-10.1,6-20.5,6.3-30.6,0.2C48.8,105.9,44.1,96.5,45,84.6c0.3-3.3,1.5-6.6,2.7-9.6c5.6-13.8,13.7-26.2,22-38.4 c0.8-1.3,1.6-2.6,2.6-3.7C72.9,32.3,73.9,32,74.8,31.4z"
                />
            </g>
        </svg>
    );
}
