import { makeValidator, anObject } from "..";

declare function log(message: string): void;

// Custom validator example

class Hex {
    constructor(public readonly digits: string) {}
}

const aHexString = makeValidator((value, options, context) => {
    if (typeof value !== "string" || !value.match(/^[0-9A-Fa-f]+$/)) {
        return context.fail(`expected a string of hex digits, not ${context.typeName(value)}`);
    }

    return new Hex(value);
});

if (aHexString.isValid("Bad")) {
    log("Good!");
}

const aResponse = anObject({
    data: aHexString.array.orNull,
});
