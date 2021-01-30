export function deserialize(content: string): any {
    return JSON.parse(content);
}

export function serialize(content: Record<string, any>): string {
    return JSON.stringify(content);
}
