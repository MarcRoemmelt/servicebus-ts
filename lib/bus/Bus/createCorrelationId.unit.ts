/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it } from 'mocha';
import chai, { expect } from 'chai';
import { Bus } from '.';
chai.should();

describe('createCorrelationId', function () {
    beforeEach(() => {
        if (!process.domain) (process as any).domain = { correlationId: 'test-value' };
        else process.domain.correlationId = 'test-value';
    });

    afterEach(() => {
        delete (process as any).domain;
    });

    it('should return string-Id', function () {
        const b = new Bus();
        const id = b.createCorrelationId();
        expect(typeof id).to.eql('string');
    });

    it('should return existing id from process.domain.correlationId', function () {
        const b = new Bus();
        const id = b.createCorrelationId();
        expect(id).to.eql('test-value');
    });

    it('should ignore existing id if forceNew is true', function () {
        const b = new Bus();
        const forceNew = true;
        const id = b.createCorrelationId(forceNew);
        expect(id).not.to.eql('test-value');
    });
});
