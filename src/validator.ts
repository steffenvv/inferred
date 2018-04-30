export interface PathContext {
    pushKey(key: string): void;
    popKey(): void;
    current(): string;
}

export interface ValidationContext {
    fail(message: string): never;
    path: PathContext;
    typeName(value: any): string;
}

export interface Validator<T> {
    validate(value: any, context?: ValidationContext): T;
    isValid(value: any): value is T;
    orNull: Validator<T | null>;
    orUndefined: Validator<T | undefined>;
    array: Validator<T[]>;
    or<U>(otherValidator: Validator<U>): Validator<T | U>;
}

export function keys<T>(obj: T): (keyof T)[] {
    return Object.keys(obj) as (keyof T)[];
}

function typeName(x: any): string {
    if (x === null) {
        return "null";
    } else if (x === undefined) {
        return "undefined";
    } else if (Array.isArray(x)) {
        return "an array";
    } else if (typeof x === "object") {
        return "an object";
    } else {
        return `a ${typeof x}`;
    }
}

export function makeContext(): ValidationContext {
    const path: string[] = [];

    const context: ValidationContext = {
        fail: (message: string): never => {
            const path = context.path.current();
            if (!path) {
                throw new Error(`Validation error: ${message}`);
            } else {
                throw new Error(`Validation error for key '${path}': ${message}`);
            }
        },

        path: {
            pushKey: key => path.push(key),

            popKey: () => path.pop(),

            current: () => path.join(".")
        },

        typeName
    };

    return context;
}

export function makeValidator<T>(validate: (value: any, context: ValidationContext) => T): Validator<T> {
    return {
        validate: (x, context = makeContext()) => {
            return validate(x, context);
        },

        isValid: (x: any): x is T => {
            try {
                validate(x, makeContext());
                return true;
            } catch {
                return false;
            }
        },

        get orNull(): Validator<T | null> {
            return makeValidator((x, context): T | null => {
                if (x === null) {
                    return null;
                }

                return validate(x, context);
            });
        },

        get orUndefined(): Validator<T | undefined> {
            return makeValidator((x, context): T | undefined => {
                if (x === undefined) {
                    return undefined;
                }

                return validate(x, context);
            });
        },

        get array(): Validator<T[]> {
            return makeValidator((x, context): T[] => {
                if (!Array.isArray(x)) {
                    context.fail(`expected an array, not ${typeName(x)}`);
                }

                const result: T[] = [];
                let changed = false;

                for (let i = 0; i < x.length; i++) {
                    context.path.pushKey(i.toString());
                    try {
                        const value = x[i];
                        const validatedValue = validate(value, context);
                        result.push(validatedValue);
                        changed = changed || value !== validatedValue;
                    } finally {
                        context.path.popKey();
                    }
                }

                /* Preserve the object identity if nothing changed. */
                return changed ? result : x;
            });
        },

        or<U>(otherValidator: Validator<U>): Validator<T | U> {
            return makeValidator((x, context): T | U => {
                try {
                    return validate(x, context);
                } catch {
                    return otherValidator.validate(x, context);
                }
            });
        }
    };
}

export const aString = makeValidator(
    (x, context): string => (typeof x === "string" ? x : context.fail(`expected a string, not ${typeName(x)}`))
);

export const aBoolean = makeValidator(
    (x, context): boolean => (typeof x === "boolean" ? x : context.fail(`expected a boolean, not ${typeName(x)}`))
);

export const aNumber = makeValidator(
    (x, context): number => (typeof x === "number" ? x : context.fail(`expected a number, not ${typeName(x)}`))
);

export function anObject<T>(validators: { [K in keyof T]-?: Validator<T[K]> | (() => Validator<T[K]>) }): Validator<T> {
    const validatorKeys = keys(validators);

    return makeValidator((x, context): T => {
        if (x === null || typeof x !== "object") {
            context.fail(`expected an object, not ${typeName(x)}`);
        }

        const result: any = {};
        let changed = false;

        for (const key of validatorKeys) {
            const value = x[key];
            const validator: Validator<any> | (() => Validator<any>) = validators[key];
            const validate = typeof validator === "function" ? validator().validate : validator.validate;

            context.path.pushKey(key);
            try {
                const validatedValue = validate(value, context);
                if (validatedValue === undefined && !x.hasOwnProperty(key)) {
                    /* Don't introduce new keys for missing optional values. */
                } else {
                    result[key] = validatedValue;
                    changed = changed || validatedValue !== value;
                }
            } finally {
                context.path.popKey();
            }
        }

        /* Check for extra keys */
        for (const key of keys(x)) {
            if (!validators.hasOwnProperty(key)) {
                context.fail(`unexpected property "${key}"`);
            }
        }

        /* Preserve the object identity if nothing changed. */
        return changed ? result : x;
    });
}

export function aStringLiteral<T extends string>(value: T): Validator<T> {
    return aStringUnion(value);
}

export function aStringUnion<T extends string>(...values: T[]): Validator<T> {
    const expectedType = values.map(x => `"${x}"`).join(" | ");

    return makeValidator((x, context) => {
        if (values.indexOf(x) === -1) {
            context.fail(`expected ${expectedType}, not ${typeName(x)}`);
        }

        return x;
    });
}
