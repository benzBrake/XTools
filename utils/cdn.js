function replaceCdnUrl(url, cdnUrl) {
    if (!cdnUrl) return url;
    return url.replace('https://cdn.jsdelivr.net/', cdnUrl.endsWith('/') ? cdnUrl : cdnUrl + '/');
}

module.exports = {
    replaceCdnUrl
};
