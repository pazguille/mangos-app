export function getPageFromURL(url) {
    const { pathname, searchParams } = new URL(url);
    const pathSplit = pathname.split('/').filter(p => !['', 'index.html'].includes(p));

    let page = 'home';
    let id = null;

    if (pathSplit.length > 0) {
        page = pathSplit[0];
        id = pathSplit[1] || null;
    }

    return { page, id, searchParams };
}
