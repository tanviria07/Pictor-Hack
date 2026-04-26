/** Signature-only scaffold - never a full solution. */
export function buildStarter(p) {
    if (p.starter_code?.trim()) {
        return p.starter_code;
    }
    const params = p.parameters.map((x) => x.name).join(", ");
    return `def ${p.function_name}(${params}):\n    pass\n`;
}
