// ----- color functions -----

// helper function to determine whether to use white or black as text color depending on given background color
// based on https://stackoverflow.com/a/3943023
export function pickTextColorBasedOnBackgroundColor(backgroundColor: string) {
    // if given color is not in hex format, convert it via canvas
    if (!backgroundColor.startsWith('#')) {
        var ctx = document.createElement('canvas').getContext('2d')!;
        ctx.fillStyle = backgroundColor;
        backgroundColor = ctx.fillStyle;
    }
    var r = parseInt(backgroundColor.substring(1, 3), 16); // hex to r
    var g = parseInt(backgroundColor.substring(3, 5), 16); // hex to g
    var b = parseInt(backgroundColor.substring(5, 7), 16); // hex to b
    return (((r * 0.299) + (g * 0.587) + (b * 0.114)) > 186) ?  'black' : 'white';
}

// see https://stackoverflow.com/a/3627747
export function rgba2hex(rgba: string): string {
    return `#${rgba.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+\.{0,1}\d*))?\)$/)!.slice(1).map((n, i) => (i === 3 ? Math.round(parseFloat(n) * 255) : parseFloat(n)).toString(16).padStart(2, '0').replace('NaN', '')).join('')}`;
}